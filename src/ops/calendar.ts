import { z } from 'zod';
import { clampEventsToRange, fetchCalendarEvents } from '../api/calendar.js';
import { defineOperation } from '../core/registry.js';
import { monthRangeKst, todayKst, weekRangeKst } from '../core/time.js';
import { formatCalendar, formatCalendarSummary } from '../render/calendar.js';

export const calendarList = defineOperation({
  id: 'calendar.list',
  tool: 'calendar_list',
  cli: ['calendar', 'list'],
  summary: 'List calendar events; omit calendar_id to use every calendar you own',
  input: z.strictObject({
    calendar_id: z.string().optional().describe('Calendar id, or several separated by commas'),
    from_date: z.string().optional().describe('YYYY-MM-DD, defaults to today'),
    to_date: z.string().optional().describe('YYYY-MM-DD, defaults to a week out'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const bundle = await fetchCalendarEvents(
      ctx.baseUrl(),
      ctx.session,
      input.calendar_id,
      input.from_date || undefined,
      input.to_date || undefined,
    );
    return { data: bundle, text: formatCalendar(bundle) };
  },
});

const RANGES = ['today', 'day', 'week', 'month'] as const;

const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  today: '오늘',
  day: '지정일',
  week: '주간',
  month: '월간',
};

export const calendarSummary = defineOperation({
  id: 'calendar.summary',
  tool: 'calendar_summary',
  cli: ['calendar', 'summary'],
  summary: 'Summarise calendar events for today, a day, a week or a month',
  input: z.strictObject({
    range: z.enum(RANGES).default('today').describe('Summary window'),
    date: z.string().optional().describe('Anchor date YYYY-MM-DD, defaults to today'),
    calendar_id: z.string().optional().describe('Calendar id, or several separated by commas'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const anchor = input.date?.trim() || todayKst();
    const window = input.range === 'week'
      ? weekRangeKst(anchor)
      : input.range === 'month'
        ? monthRangeKst(anchor)
        : { from: anchor, to: anchor };

    const bundle = clampEventsToRange(
      await fetchCalendarEvents(ctx.baseUrl(), ctx.session, input.calendar_id, window.from, window.to),
    );
    return { data: bundle, text: formatCalendarSummary(bundle, RANGE_LABEL[input.range]) };
  },
});

export const calendarOperations = [calendarList, calendarSummary];
