import { z } from 'zod';
import { attendanceMonth } from '../api/attendance.js';
import { userSession } from '../core/auth.js';
import { defineOperation } from '../core/registry.js';
import { todayKst } from '../core/time.js';
import { formatAttendanceMonth } from '../render/attendance.js';

export const attendHistory = defineOperation({
  id: 'attend.history',
  tool: 'attend_history',
  cli: ['attend', 'history'],
  summary: 'Show the monthly attendance sheet with per-day work records and totals',
  input: z.strictObject({
    month: z.string().optional().describe('YYYY-MM, defaults to the current month'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const baseDate = input.month?.trim() ? `${input.month.trim().slice(0, 7)}-01` : todayKst();
    const user = await userSession(ctx.baseUrl(), ctx.session);
    const sheet = await attendanceMonth(ctx.baseUrl(), ctx.session, user.id, baseDate);
    return { data: sheet, text: formatAttendanceMonth(sheet) };
  },
});

export const attendanceOperations = [attendHistory];
