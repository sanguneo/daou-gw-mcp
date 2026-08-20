import { z } from 'zod';
import { attendanceMonth, attendanceStatus, clockIn, clockOut } from '../api/attendance.js';
import { userSession } from '../core/auth.js';
import { attendEnabled } from '../core/config.js';
import { defineOperation } from '../core/registry.js';
import { todayKst } from '../core/time.js';
import { formatAttendanceAction, formatAttendanceMonth, formatAttendanceStatus } from '../render/attendance.js';

/** Attendance stays invisible on every surface until `attend` is enabled. */
const hidden = (cfg: Parameters<typeof attendEnabled>[0]) => !attendEnabled(cfg);

export const attendStatus = defineOperation({
  id: 'attend.status',
  tool: 'attend_status',
  cli: ['attend', 'status'],
  summary: 'Check attendance state',
  input: z.strictObject({}),
  auth: true,
  hidden,
  run: async (ctx) => {
    const status = await attendanceStatus(ctx.baseUrl(), ctx.session);
    return { data: status, text: formatAttendanceStatus(status) };
  },
});

export const attendIn = defineOperation({
  id: 'attend.in',
  tool: 'attend_in',
  cli: ['attend', 'in'],
  summary: 'Clock in using the saved session',
  input: z.strictObject({}),
  auth: true,
  hidden,
  run: async (ctx) => {
    const result = await clockIn(ctx.baseUrl(), ctx.session);
    return { data: result, text: formatAttendanceAction(result) };
  },
});

export const attendOut = defineOperation({
  id: 'attend.out',
  tool: 'attend_out',
  cli: ['attend', 'out'],
  summary: 'Clock out using the saved session',
  input: z.strictObject({}),
  auth: true,
  hidden,
  run: async (ctx) => {
    const result = await clockOut(ctx.baseUrl(), ctx.session);
    return { data: result, text: formatAttendanceAction(result) };
  },
});

export const attendHistory = defineOperation({
  id: 'attend.history',
  tool: 'attend_history',
  cli: ['attend', 'history'],
  summary: 'Show the monthly attendance sheet with per-day clock in/out and totals',
  input: z.strictObject({
    month: z.string().optional().describe('YYYY-MM, defaults to the current month'),
  }),
  auth: true,
  hidden,
  run: async (ctx, input) => {
    const baseDate = input.month?.trim() ? `${input.month.trim().slice(0, 7)}-01` : todayKst();
    const user = await userSession(ctx.baseUrl(), ctx.session);
    const sheet = await attendanceMonth(ctx.baseUrl(), ctx.session, user.id, baseDate);
    return { data: sheet, text: formatAttendanceMonth(sheet) };
  },
});

export const attendanceOperations = [attendStatus, attendIn, attendOut, attendHistory];
