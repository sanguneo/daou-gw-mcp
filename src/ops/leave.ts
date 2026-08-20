import { z } from 'zod';
import { approvalLeaveCount } from '../api/approval.js';
import { resolveDeptId } from '../api/organization.js';
import { userSession } from '../core/auth.js';
import { defineOperation } from '../core/registry.js';
import { formatLeaveCount, leaveVariables } from '../render/approval.js';

const configuredIdSchema = z.coerce.number().int().min(1);

class LeaveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeaveConfigError';
  }
}

function configuredId(raw: string | undefined, envName: string): number | undefined {
  if (!raw?.trim()) return undefined;
  const parsed = configuredIdSchema.safeParse(raw);
  if (!parsed.success) throw new LeaveConfigError(`${envName} must be a positive integer`);
  return parsed.data;
}

export const approvalLeaveCountOp = defineOperation({
  id: 'approval.leave_count',
  tool: 'approval_leave_count',
  cli: ['leavecount'],
  summary: 'Show annual leave usage and balance',
  input: z.strictObject({
    form_id: z.number().int().min(1).optional().describe('Leave request form id; defaults to DAOU_LEAVE_FORM_ID'),
    dept_id: z.number().int().min(1).optional().describe('Department id; resolved from the org chart when omitted'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const baseUrl = ctx.baseUrl();
    const formId = input.form_id ?? configuredId(ctx.cfg.leave_form_id, 'DAOU_LEAVE_FORM_ID');
    if (formId === undefined) {
      throw new LeaveConfigError('leave form id required; set DAOU_LEAVE_FORM_ID or pass --form-id');
    }

    let deptId = input.dept_id ?? configuredId(ctx.cfg.leave_dept_id, 'DAOU_LEAVE_DEPT_ID');
    if (deptId === undefined) {
      const user = await userSession(baseUrl, ctx.session);
      deptId = await resolveDeptId(baseUrl, ctx.session, user.id);
      if (deptId === undefined) {
        throw new LeaveConfigError('could not resolve the department; set DAOU_LEAVE_DEPT_ID or pass --dept-id');
      }
    }

    const raw = await approvalLeaveCount(baseUrl, ctx.session, formId, deptId);
    const variables = leaveVariables(raw);
    return {
      data: variables
        ? {
            usedPoint: variables.usedPoint,
            restPoint: variables.restPoint,
            additionPoint: variables.additionPoint,
            totalPoint: variables.totalPoint,
          }
        : { raw },
      text: formatLeaveCount(raw),
    };
  },
});

export const leaveOperations = [approvalLeaveCountOp];
