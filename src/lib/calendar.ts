import type { Session } from './types.js';
import { requestJson } from './http.js';

const KST = 'Asia/Seoul';

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

function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

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

function addDaysKst(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return todayKst(d);
}

function kstStart(date: string): string {
  return `${date}T00:00:00.000+09:00`;
}

function kstEnd(date: string): string {
  return `${date}T23:59:59.999+09:00`;
}

function parseExplicitCalendarIds(calendarId?: string): string[] | null {
  if (calendarId === undefined) return null;
  const ids = calendarId.split(',').map((v) => v.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  for (const id of ids) {
    if (!/^\d+$/.test(id)) return null;
  }
  return ids;
}

function isCalendarSummary(value: unknown): value is CalendarSummary {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as CalendarSummary).id === 'number';
}

async function listUserCalendars(baseUrl: string, session: Session): Promise<CalendarSummary[]> {
  const userId = session.user_id;
  if (!userId) {
    throw new Error('calendar session user_id missing');
  }
  const url = `${trimBaseUrl(baseUrl)}/api/calendar/user/${userId}/calendar`;
  const { status, data } = await requestJson<{ data?: unknown }>(url, {
    method: 'GET',
    headers: {
      Referer: `${trimBaseUrl(baseUrl)}/app/calendar`,
      Accept: 'application/json',
    },
  }, session);
  if (status >= 400) {
    throw new Error(`calendar calendars http ${status}`);
  }
  if (!data || !Array.isArray(data.data)) {
    return [];
  }
  return data.data.filter(isCalendarSummary);
}

export async function fetchCalendarEvents(
  baseUrl: string,
  session: Session,
  calendarId?: string,
  fromDate = todayKst(),
  toDate = addDaysKst(fromDate, 7),
): Promise<CalendarEventBundle> {
  const explicitIds = parseExplicitCalendarIds(calendarId);
  const calendars = await listUserCalendars(baseUrl, session);
  const calendarIds = explicitIds ?? calendars.map((calendar) => String(calendar.id));
  if (calendarIds.length === 0) {
    throw new Error('calendar ids missing');
  }
  const params = new URLSearchParams();
  params.set('timeMin', kstStart(fromDate));
  params.set('timeMax', kstEnd(toDate));
  for (const id of calendarIds) {
    params.append('calendarIds[]', id);
  }
  const url = `${trimBaseUrl(baseUrl)}/api/calendar/event?${params.toString()}`;
  const { status, data } = await requestJson<{ data?: unknown[] }>(url, {
    method: 'GET',
    headers: {
      Referer: `${trimBaseUrl(baseUrl)}/app/calendar`,
      Accept: 'application/json',
    },
  }, session);
  if (status >= 400) {
    throw new Error(`calendar list http ${status}`);
  }
  return {
    calendarId: explicitIds === null ? null : explicitIds.join(','),
    calendarIds,
    calendars,
    fromDate,
    toDate,
    data: data.data ?? [],
  };
}

export async function listCalendarEvents(
  baseUrl: string,
  session: Session,
  calendarId?: string,
  fromDate = todayKst(),
  toDate = addDaysKst(fromDate, 7),
): Promise<string> {
  return JSON.stringify(await fetchCalendarEvents(baseUrl, session, calendarId, fromDate, toDate));
}
