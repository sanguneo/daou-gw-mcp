import { formatDateOnly, formatTimeOnly, weekdayKo } from '../core/time.js';
import type { CalendarEventBundle } from '../api/calendar.js';
import { cleanLabel, isRecord, lines } from './common.js';

function pickString(entry: Record<string, any>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function formatEntry(entry: any, index: number, calendarNames: Map<string, string>): string {
  if (!isRecord(entry)) return `${index}. 내용 없음`;

  const title = cleanLabel(pickString(entry, ['title', 'subject', 'eventName', 'summary'])) || '내용 없음';
  const start = pickString(entry, ['startTime', 'startDateTime', 'start']);
  const end = pickString(entry, ['endTime', 'endDateTime', 'end']);
  const allDay = entry.timeType === 'allday' || entry.allDay === true || entry.type === 'holiday';
  const place = cleanLabel(pickString(entry, ['location', 'place', 'room']));

  const calendarId = entry.calendarId === undefined || entry.calendarId === null ? '' : String(entry.calendarId);
  const calendarName = cleanLabel(calendarNames.get(calendarId) ?? '') || (calendarId ? `캘린더 ${calendarId}` : '');

  const dateLabel = allDay
    ? formatDateOnly(start ?? end)
    : `${formatDateOnly(start)} ${formatTimeOnly(start)}~${formatTimeOnly(end)}`;

  return `${index}. ${dateLabel} | ${title}${place ? ` | ${place}` : ''}${calendarName ? ` | ${calendarName}` : ''}`;
}

function calendarNameMap(bundle: CalendarEventBundle): Map<string, string> {
  const names = new Map<string, string>();
  for (const calendar of bundle.calendars) {
    const name = cleanLabel(calendar.name);
    if (name) names.set(String(calendar.id), name);
  }
  return names;
}

function eventDay(entry: Record<string, any>): string {
  const start = pickString(entry, ['startTime', 'startDateTime', 'start']);
  return formatDateOnly(start ?? pickString(entry, ['endTime', 'endDateTime', 'end']));
}

/** Grouped day-by-day digest for a date range. */
export function formatCalendarSummary(bundle: CalendarEventBundle, label: string): string {
  const names = calendarNameMap(bundle);
  const entries = bundle.data.filter(isRecord);
  const allDay = entries.filter((entry) => entry.timeType === 'allday' || entry.allDay === true || entry.type === 'holiday');

  const byDay = new Map<string, Record<string, any>[]>();
  for (const entry of entries) {
    const day = eventDay(entry);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(entry);
    else byDay.set(day, [entry]);
  }

  const perCalendar = new Map<string, number>();
  for (const entry of entries) {
    const id = entry.calendarId === undefined || entry.calendarId === null ? '' : String(entry.calendarId);
    const name = names.get(id) ?? (id ? `캘린더 ${id}` : '기타');
    perCalendar.set(name, (perCalendar.get(name) ?? 0) + 1);
  }

  const dayBlocks: string[] = [];
  for (const day of [...byDay.keys()].sort()) {
    const items = byDay.get(day) ?? [];
    dayBlocks.push(`${day}(${weekdayKo(day)}) — ${items.length}건`);
    for (const [index, entry] of items.entries()) {
      dayBlocks.push(`  ${formatEntry(entry, index + 1, names)}`);
    }
  }

  return lines(
    `캘린더 요약 · ${label}`,
    `기간: ${bundle.fromDate} ~ ${bundle.toDate}`,
    `총 ${entries.length}건 (종일 ${allDay.length} / 시간지정 ${entries.length - allDay.length})`,
    perCalendar.size > 0 ? `캘린더별: ${[...perCalendar.entries()].map(([name, count]) => `${name} ${count}`).join(', ')}` : null,
    entries.length > 0 ? '' : '일정이 없습니다.',
    ...dayBlocks,
  );
}

export function formatCalendar(bundle: CalendarEventBundle): string {
  const calendarNames = new Map<string, string>();
  for (const calendar of bundle.calendars) {
    const name = cleanLabel(calendar.name);
    if (name) calendarNames.set(String(calendar.id), name);
  }
  return lines(
    '캘린더 일정',
    `기간: ${bundle.fromDate} ~ ${bundle.toDate}`,
    `항목 수: ${bundle.data.length}`,
    ...bundle.data.map((entry, index) => formatEntry(entry, index + 1, calendarNames)),
  );
}
