import { requestJson, requestText, trimBaseUrl } from '../core/http.js';
import { isWeekendKst, todayKst } from '../core/time.js';
import { userSession } from '../core/auth.js';
import { fetchCalendarEvents } from './calendar.js';
import type { AttendanceActionResult, AttendanceStatus, Session } from '../core/types.js';

const FIXED_HOLIDAYS: Record<string, string> = {
  '01-01': '신정',
  '03-01': '삼일절',
  '05-05': '어린이날',
  '06-06': '현충일',
  '08-15': '광복절',
  '10-03': '개천절',
  '10-09': '한글날',
  '12-25': '크리스마스',
};

function normalizeText(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function eventText(event: Record<string, unknown>): string {
  return [event.title, event.subject, event.summary, event.eventName, event.name]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join(' ');
}

/** Recognise leave wording on a calendar entry. Order matters: 반차 before 연차. */
function detectLeaveFromText(text: string): string | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (normalized.includes('오전반차')) return '오전반차';
  if (normalized.includes('오후반차')) return '오후반차';
  if (normalized.includes('반차')) return '반차';
  if (normalized.includes('연차') || normalized.includes('휴가')) return '연차';
  return null;
}

function detectHolidayFromDate(date: string): { holiday: boolean; leaveEvent?: string } | null {
  if (isWeekendKst(date)) return { holiday: true, leaveEvent: '주말' };
  const name = FIXED_HOLIDAYS[date.slice(5)];
  return name ? { holiday: true, leaveEvent: name } : null;
}

function detectCalendarLeave(events: unknown[]): { leave: string; leaveEvent?: string } | null {
  for (const item of events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const text = eventText(item as Record<string, unknown>);
    const leave = detectLeaveFromText(text);
    if (leave) return { leave, leaveEvent: text || undefined };
  }
  return null;
}

/** Clocking is refused on holidays and on any kind of leave. */
function isBlocked(status: Pick<AttendanceStatus, 'leave' | 'holiday'>): boolean {
  return status.holiday || status.leave !== '출근';
}

export async function attendanceHistory(
  baseUrl: string,
  session: Session,
  userId: number,
  today = todayKst(),
): Promise<{ clockedIn: boolean; clockedOut: boolean }> {
  const root = trimBaseUrl(baseUrl);
  const url = `${root}/api/ehr/timeline/month?baseDate=${encodeURIComponent(today)}&userId=${encodeURIComponent(String(userId))}`;
  const { data } = await requestJson<{ weekList?: unknown[] }>(url, {
    method: 'GET',
    headers: { Referer: `${root}/app/ehr`, Accept: 'application/json', timezoneoffset: '540' },
  }, session);

  for (const weekItem of data.weekList ?? []) {
    const dailyList = (weekItem as Record<string, unknown>).dailyList as unknown[] | undefined;
    for (const dailyItem of dailyList ?? []) {
      const daily = dailyItem as Record<string, unknown>;
      const detailDay = daily.detailDay as Record<string, unknown> | undefined;
      if (String(detailDay?.day ?? '') !== today) continue;
      return { clockedIn: daily.clockInHistory != null, clockedOut: daily.clockOutHistory != null };
    }
  }
  throw new Error('오늘 데이터 없음');
}

export interface AttendanceDay {
  day: string;
  dayOfWeek: string;
  holiday: boolean;
  workingDay: boolean;
  clockInTime?: string;
  clockOutTime?: string;
  workingTimeStr?: string;
  tardy: boolean;
  early: boolean;
  absence: boolean;
  future: boolean;
}

export interface AttendanceMonth {
  month: string;
  userName?: string;
  days: AttendanceDay[];
  totals: { normal: string; extension: string; night: string; total: string };
  counts: { worked: number; tardy: number; early: number; absence: number; holiday: number };
}

function timeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function durationString(workingTime: unknown, key: string): string {
  const record = workingTime as Record<string, unknown> | undefined;
  const value = record?.[key];
  return typeof value === 'string' ? value : '0h 0m 0s';
}

/** Monthly attendance sheet: one row per day plus the month totals. */
export async function attendanceMonth(
  baseUrl: string,
  session: Session,
  userId: number,
  baseDate = todayKst(),
): Promise<AttendanceMonth> {
  const root = trimBaseUrl(baseUrl);
  const url = `${root}/api/ehr/timeline/month?baseDate=${encodeURIComponent(baseDate)}&userId=${encodeURIComponent(String(userId))}`;
  const { status, data } = await requestJson<Record<string, any>>(url, {
    method: 'GET',
    headers: { Referer: `${root}/app/ehr`, Accept: 'application/json', timezoneoffset: '540' },
  }, session);
  if (status >= 400) throw new Error(`attendance month http ${status}`);

  const days: AttendanceDay[] = [];
  for (const week of data.weekList ?? []) {
    for (const daily of week?.dailyList ?? []) {
      const detail = daily?.detailDay ?? {};
      const day = String(detail.day ?? '');
      if (!day) continue;
      days.push({
        day,
        dayOfWeek: String(detail.dayOfWeekStr ?? ''),
        holiday: daily.holiDay === true,
        workingDay: daily.workingDay === true,
        clockInTime: timeString(daily.clockInTime),
        clockOutTime: timeString(daily.clockOutTime),
        workingTimeStr: timeString(daily.workingTime?.totalStr),
        tardy: daily.tardy === true,
        early: daily.early === true,
        absence: daily.absence === true,
        future: detail.afterNow === true,
      });
    }
  }

  // Days that have not happened yet carry placeholder flags; they must not be counted.
  const elapsed = days.filter((day) => !day.future);

  return {
    month: String(data.yyyymm ?? baseDate.slice(0, 7).replace('-', '')),
    userName: typeof data.user?.name === 'string' ? data.user.name : undefined,
    days,
    totals: {
      normal: durationString(data.workingTime, 'normalStr'),
      extension: durationString(data.workingTime, 'extensionStr'),
      night: durationString(data.workingTime, 'nightStr'),
      total: durationString(data.workingTime, 'totalStr'),
    },
    counts: {
      worked: elapsed.filter((day) => day.clockInTime).length,
      tardy: elapsed.filter((day) => day.tardy).length,
      early: elapsed.filter((day) => day.early).length,
      absence: elapsed.filter((day) => day.absence).length,
      holiday: elapsed.filter((day) => day.holiday).length,
    },
  };
}

export async function attendanceStatus(baseUrl: string, session: Session): Promise<AttendanceStatus> {
  const user = await userSession(baseUrl, session);
  const today = todayKst();
  const [calendar, history] = await Promise.all([
    fetchCalendarEvents(baseUrl, session, undefined, today, today).catch(() => null),
    attendanceHistory(baseUrl, session, user.id, today).catch(() => ({ clockedIn: false, clockedOut: false })),
  ]);

  const calendarLeave = calendar ? detectCalendarLeave(calendar.data) : null;
  const dateHoliday = detectHolidayFromDate(today);
  const holiday = dateHoliday?.holiday ?? false;

  return {
    userId: user.id,
    today,
    leave: calendarLeave?.leave ?? (holiday ? '휴일' : '출근'),
    holiday,
    leaveEvent: calendarLeave?.leaveEvent ?? dateHoliday?.leaveEvent,
    leaveSource: calendarLeave ? 'calendar' : undefined,
    clockedIn: history.clockedIn,
    clockedOut: history.clockedOut,
  };
}

async function clock(baseUrl: string, session: Session, userId: number, action: 'clockIn' | 'clockOut', now: Date): Promise<void> {
  const root = trimBaseUrl(baseUrl);
  const workingDay = todayKst(now);
  const url = `${root}/api/ehr/timeline/status/${action}?userId=${encodeURIComponent(String(userId))}&baseDate=${encodeURIComponent(workingDay)}`;
  const { status, text } = await requestText(url, {
    method: 'POST',
    body: JSON.stringify({ checkTime: now.toISOString(), timelineStatus: {}, isNightWork: false, workingDay }),
    headers: { 'Content-Type': 'application/json', Referer: `${root}/app/ehr`, timezoneoffset: '540' },
  }, session);
  if (status >= 400) throw new Error(`${action} http ${status}: ${text.trim()}`);
}

export async function clockIn(baseUrl: string, session: Session): Promise<AttendanceActionResult> {
  const status = await attendanceStatus(baseUrl, session);
  const base = { action: 'in' as const, userId: status.userId, today: status.today };
  if (isBlocked(status)) return { ...base, ok: false, status: 'skip', reason: 'leave_or_holiday', blockedBy: status.leave };
  if (status.clockedIn) return { ...base, ok: true, status: 'already' };
  await clock(baseUrl, session, status.userId, 'clockIn', new Date());
  return { ...base, ok: true, status: 'done' };
}

export async function clockOut(baseUrl: string, session: Session): Promise<AttendanceActionResult> {
  const status = await attendanceStatus(baseUrl, session);
  const base = { action: 'out' as const, userId: status.userId, today: status.today };
  if (isBlocked(status)) return { ...base, ok: false, status: 'skip', reason: 'leave_or_holiday', blockedBy: status.leave };
  if (!status.clockedIn) return { ...base, ok: false, status: 'skip', reason: 'not_clocked_in' };
  if (status.clockedOut) return { ...base, ok: true, status: 'already' };
  await clock(baseUrl, session, status.userId, 'clockOut', new Date());
  return { ...base, ok: true, status: 'done' };
}
