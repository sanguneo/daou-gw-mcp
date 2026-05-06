import type { AttendanceStatus, Session } from './types.js';
import { requestJson, requestText } from './http.js';
import { userSession } from './auth.js';
import { fetchCalendarEvents } from './calendar.js';

const KST = 'Asia/Seoul';

function todayKst(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function normalizeText(value?: string): string {
  return (value ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

function extractEventText(event: Record<string, unknown>): string {
  const candidates = [event.title, event.subject, event.summary, event.eventName, event.name];
  return candidates
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .join(' ');
}

function isWeekendKst(date: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: KST, weekday: 'short' }).format(new Date(`${date}T00:00:00.000+09:00`));
  return weekday === 'Sat' || weekday === 'Sun';
}

function fixedHolidayName(date: string): string | null {
  switch (date.slice(5)) {
    case '01-01': return '신정';
    case '03-01': return '삼일절';
    case '05-05': return '어린이날';
    case '06-06': return '현충일';
    case '08-15': return '광복절';
    case '10-03': return '개천절';
    case '10-09': return '한글날';
    case '12-25': return '크리스마스';
    default: return null;
  }
}

function detectLeaveFromText(text: string): { leave: string; holiday: boolean } | null {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (normalized.includes('오전반차')) return { leave: '오전반차', holiday: false };
  if (normalized.includes('오후반차')) return { leave: '오후반차', holiday: false };
  if (normalized.includes('반차')) return { leave: '반차', holiday: false };
  if (normalized.includes('연차') || normalized.includes('연차휴가') || normalized.includes('휴가')) return { leave: '연차', holiday: false };
  return null;
}

function detectHolidayFromDate(date: string): { holiday: boolean; leaveEvent?: string } | null {
  if (isWeekendKst(date)) return { holiday: true, leaveEvent: '주말' };
  const name = fixedHolidayName(date);
  if (name) return { holiday: true, leaveEvent: name };
  return null;
}

function detectCalendarLeave(events: unknown[]): { leave: string; holiday: boolean; leaveEvent?: string } | null {
  for (const item of events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const event = item as Record<string, unknown>;
    const text = extractEventText(event);
    const detected = detectLeaveFromText(text);
    if (!detected) continue;
    return {
      leave: detected.leave,
      holiday: false,
      leaveEvent: text || undefined,
    };
  }
  return null;
}

function defaultLeave(): string {
  return '출근';
}

function shouldBlockAttendance(status: Pick<AttendanceStatus, 'leave' | 'holiday'>): boolean {
  return status.holiday || status.leave !== '출근';
}

export async function isHoliday(baseUrl: string, session: Session, today = todayKst()): Promise<boolean> {
  const [calendar] = await Promise.all([
    fetchCalendarEvents(baseUrl, session, undefined, today, today).catch(() => null),
  ]);
  void calendar;
  const dateHoliday = detectHolidayFromDate(today);
  return Boolean(dateHoliday?.holiday ?? false);
}

export async function attendanceHistory(baseUrl: string, session: Session, userId: number, today = todayKst()): Promise<{ clockedIn: boolean; clockedOut: boolean }> {
  const url = `${trimBaseUrl(baseUrl)}/api/ehr/timeline/month?baseDate=${encodeURIComponent(today)}&userId=${encodeURIComponent(String(userId))}`;
  const { data } = await requestJson<{ weekList?: unknown[] }>(url, {
    method: 'GET',
    headers: {
      Referer: `${trimBaseUrl(baseUrl)}/app/ehr`,
      Accept: 'application/json',
      timezoneoffset: '540',
    },
  }, session);
  for (const weekItem of data.weekList ?? []) {
    const week = weekItem as Record<string, unknown>;
    const dailyList = week.dailyList as unknown[] | undefined;
    if (!dailyList) continue;
    for (const dailyItem of dailyList) {
      const daily = dailyItem as Record<string, unknown>;
      const detailDay = daily.detailDay as Record<string, unknown> | undefined;
      if (String(detailDay?.day ?? '') !== today) continue;
      return {
        clockedIn: daily.clockInHistory != null,
        clockedOut: daily.clockOutHistory != null,
      };
    }
  }
  throw new Error('오늘 데이터 없음');
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
  const leave = calendarLeave?.leave ?? (holiday ? '휴일' : '출근');
  const leaveEvent = calendarLeave?.leaveEvent ?? dateHoliday?.leaveEvent;
  return {
    userId: user.id,
    today,
    leave,
    holiday,
    leaveEvent,
    leaveSource: calendarLeave ? 'calendar' : undefined,
    clockedIn: history.clockedIn,
    clockedOut: history.clockedOut,
  };
}

export interface AttendanceActionResult {
  ok: boolean;
  action: 'in' | 'out';
  userId: number;
  today: string;
  status: 'done' | 'already' | 'skip' | 'dryrun';
  reason?: string;
  blockedBy?: string;
  dryRun?: boolean;
}

async function clockAttendance(baseUrl: string, userId: number, now: Date, action: 'clockIn' | 'clockOut', session: Session): Promise<void> {
  const workingDay = todayKst(now);
  const url = `${trimBaseUrl(baseUrl)}/api/ehr/timeline/status/${action}?userId=${encodeURIComponent(String(userId))}&baseDate=${encodeURIComponent(workingDay)}`;
  const body = {
    checkTime: now.toISOString(),
    timelineStatus: {},
    isNightWork: false,
    workingDay,
  };
  const { status, text } = await requestText(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Referer: `${trimBaseUrl(baseUrl)}/app/ehr`,
      timezoneoffset: '540',
    },
  }, session);
  if (status >= 400) {
    throw new Error(`${action} http ${status}: ${text.trim()}`);
  }
}

export async function clockInAttendance(baseUrl: string, session: Session): Promise<AttendanceActionResult> {
  const status = await attendanceStatus(baseUrl, session);
  if (shouldBlockAttendance(status)) {
    return { ok: false, action: 'in', userId: status.userId, today: status.today, status: 'skip', reason: 'leave_or_holiday', blockedBy: status.leave };
  }
  if (status.clockedIn) {
    return { ok: true, action: 'in', userId: status.userId, today: status.today, status: 'already' };
  }
  await clockAttendance(baseUrl, status.userId, new Date(), 'clockIn', session);
  return { ok: true, action: 'in', userId: status.userId, today: status.today, status: 'done' };
}

export async function clockOutAttendance(baseUrl: string, session: Session): Promise<AttendanceActionResult> {
  const status = await attendanceStatus(baseUrl, session);
  if (shouldBlockAttendance(status)) {
    return { ok: false, action: 'out', userId: status.userId, today: status.today, status: 'skip', reason: 'leave_or_holiday', blockedBy: status.leave };
  }
  if (!status.clockedIn) {
    return { ok: false, action: 'out', userId: status.userId, today: status.today, status: 'skip', reason: 'not_clocked_in' };
  }
  if (status.clockedOut) {
    return { ok: true, action: 'out', userId: status.userId, today: status.today, status: 'already' };
  }
  await clockAttendance(baseUrl, status.userId, new Date(), 'clockOut', session);
  return { ok: true, action: 'out', userId: status.userId, today: status.today, status: 'done' };
}

export function renderAttendanceActionResult(result: AttendanceActionResult): string {
  switch (result.status) {
    case 'done':
      return result.action === 'in' ? '출근 처리 완료' : '퇴근 처리 완료';
    case 'already':
      return result.action === 'in' ? '이미 출근 처리됨' : '이미 퇴근 처리됨';
    case 'dryrun':
      return '퇴근 dry-run: 실제 호출 안 함';
    case 'skip':
      if (result.reason === 'not_clocked_in') return '건너뜀: 아직 출근 처리 전';
      if (result.reason === 'leave_or_holiday') return `건너뜀: ${result.blockedBy ?? '연차/반차/휴일'} 일정 있음`;
      return '건너뜀';
  }
}
