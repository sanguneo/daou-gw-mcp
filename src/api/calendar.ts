import { requestJson, trimBaseUrl } from '../core/http.js';
import type { Session } from '../core/types.js';
import { addDaysKst, formatDateOnly, todayKst } from '../core/time.js';

export interface CalendarSummary {
  id: number;
  name?: string;
  type?: string;
  visibility?: string;
  permission?: boolean;
  defaultCalendar?: boolean;
  newCompanyCalendar?: boolean;
  seq?: number;
}

export interface CalendarEventBundle {
  calendarId: string | null;
  calendarIds: string[];
  calendars: CalendarSummary[];
  fromDate: string;
  toDate: string;
  data: unknown[];
}

function eventStart(entry: Record<string, unknown>): string | undefined {
  for (const key of ['startTime', 'startDateTime', 'start', 'endTime', 'endDateTime', 'end']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** The KST calendar day an event falls on, or '' when it has no usable date. */
export function eventDateKst(entry: unknown): string {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const start = eventStart(entry as Record<string, unknown>);
  return start ? formatDateOnly(start) : '';
}

/** The KST calendar day an event ends on (its start day when it has no end), or ''. */
export function eventEndDateKst(entry: unknown): string {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return '';
  const record = entry as Record<string, unknown>;
  for (const key of ['endTime', 'endDateTime', 'end']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return formatDateOnly(value.trim());
  }
  return eventDateKst(entry);
}

/**
 * Holiday and recurring calendars answer with entries outside the requested
 * window, so a range view has to trim them itself. Multi-day events (leave,
 * trips) that started earlier but still overlap the window are kept.
 */
export function clampEventsToRange(bundle: CalendarEventBundle): CalendarEventBundle {
  const data = bundle.data.filter((entry) => {
    const start = eventDateKst(entry);
    return start !== '' && start <= bundle.toDate && eventEndDateKst(entry) >= bundle.fromDate;
  });
  return { ...bundle, data };
}

export interface UpcomingEvent {
  minutesUntil: number;
  calendarName?: string;
  event: Record<string, unknown>;
}

function isAllDay(entry: Record<string, unknown>): boolean {
  return entry.timeType === 'allday' || entry.allDay === true || entry.type === 'holiday';
}

/** Timed events whose start falls in [now, until], soonest first. */
export function upcomingEvents(bundle: CalendarEventBundle, now: Date, until: Date): UpcomingEvent[] {
  const names = new Map(bundle.calendars.map((calendar) => [String(calendar.id), calendar.name]));
  const result: UpcomingEvent[] = [];
  for (const entry of bundle.data) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const event = entry as Record<string, unknown>;
    if (isAllDay(event)) continue;
    const start = typeof event.startTime === 'string' ? new Date(event.startTime) : null;
    if (!start || Number.isNaN(start.getTime()) || start < now || start > until) continue;
    result.push({
      minutesUntil: Math.round((start.getTime() - now.getTime()) / 60_000),
      calendarName: names.get(String(event.calendarId)),
      event,
    });
  }
  return result.sort((a, b) => a.minutesUntil - b.minutesUntil);
}

function kstStart(date: string): string {
  return `${date}T00:00:00.000+09:00`;
}

function kstEnd(date: string): string {
  return `${date}T23:59:59.999+09:00`;
}

/** Accept `7` or `7,8,9`; anything non-numeric means "use my calendars". */
function parseExplicitCalendarIds(calendarId?: string): string[] | null {
  if (calendarId === undefined) return null;
  const ids = calendarId.split(',').map((v) => v.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}

function isCalendarSummary(value: unknown): value is CalendarSummary {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as CalendarSummary).id === 'number';
}

async function listUserCalendars(baseUrl: string, session: Session): Promise<CalendarSummary[]> {
  const userId = session.user_id;
  if (!userId) throw new Error('calendar session user_id missing');
  const { status, data } = await requestJson<{ data?: unknown }>(
    `${trimBaseUrl(baseUrl)}/api/calendar/user/${userId}/calendar`,
    { method: 'GET', headers: { Referer: `${trimBaseUrl(baseUrl)}/app/calendar`, Accept: 'application/json' } },
    session,
  );
  if (status >= 400) throw new Error(`calendar calendars http ${status}`);
  return Array.isArray(data?.data) ? data.data.filter(isCalendarSummary) : [];
}

/** Colleagues' calendars the user follows, named "<owner> <calendar>" so they stay distinguishable. */
async function listFollowedCalendars(baseUrl: string, session: Session): Promise<CalendarSummary[]> {
  const { status, data } = await requestJson<{ data?: unknown }>(
    `${trimBaseUrl(baseUrl)}/api/calendar/feed?sort=${encodeURIComponent('sequence asc')}`,
    { method: 'GET', headers: { Referer: `${trimBaseUrl(baseUrl)}/app/calendar`, Accept: 'application/json' } },
    session,
  );
  if (status >= 400) throw new Error(`calendar feed http ${status}`);
  if (!Array.isArray(data?.data)) return [];
  return data.data
    .map((follow) => (follow && typeof follow === 'object' ? (follow as { calendar?: unknown }).calendar : undefined))
    .filter(isCalendarSummary)
    .map((calendar) => {
      const owner = (calendar as { owner?: { name?: string } }).owner?.name;
      return { ...calendar, name: owner ? `${owner} ${calendar.name ?? ''}`.trim() : calendar.name };
    });
}

export async function fetchCalendarEvents(
  baseUrl: string,
  session: Session,
  calendarId?: string,
  fromDate = todayKst(),
  toDate = addDaysKst(fromDate, 7),
  following = false,
): Promise<CalendarEventBundle> {
  const explicitIds = parseExplicitCalendarIds(calendarId);
  const calendars = [
    ...(await listUserCalendars(baseUrl, session)),
    ...(following ? await listFollowedCalendars(baseUrl, session) : []),
  ];
  const calendarIds = explicitIds ?? calendars.map((calendar) => String(calendar.id));
  if (calendarIds.length === 0) throw new Error('calendar ids missing');

  const params = new URLSearchParams();
  params.set('timeMin', kstStart(fromDate));
  params.set('timeMax', kstEnd(toDate));
  for (const id of calendarIds) params.append('calendarIds[]', id);

  const { status, data } = await requestJson<{ data?: unknown[] }>(
    `${trimBaseUrl(baseUrl)}/api/calendar/event?${params.toString()}`,
    { method: 'GET', headers: { Referer: `${trimBaseUrl(baseUrl)}/app/calendar`, Accept: 'application/json' } },
    session,
  );
  if (status >= 400) throw new Error(`calendar list http ${status}`);

  return {
    calendarId: explicitIds === null ? null : explicitIds.join(','),
    calendarIds,
    calendars,
    fromDate,
    toDate,
    data: data.data ?? [],
  };
}
