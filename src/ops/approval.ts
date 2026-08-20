import { z } from 'zod';
import {
  APPROVAL_REFERENCE_KINDS,
  APPROVAL_TODO_KINDS,
  DOCUMENT_BOXES,
  DOCUMENT_BOX_KINDS,
  approvalCount,
  approvalDocument,
  approvalLeaveCount,
  approvalList,
  documentNew,
  documentTempSave,
  fetchDocumentBox,
  fetchFormTree,
  fetchFormTreeDeep,
  flattenForms,
} from '../api/approval.js';
import { resolveDeptId } from '../api/organization.js';
import { userSession } from '../core/auth.js';
import { defineOperation, rawResult } from '../core/registry.js';
import {
  formatApprovalCount,
  formatApprovalList,
  formatDocument,
  formatDocumentBox,
  formatDraftSaved,
  formatFormSearch,
  formatFormTree,
  formatLeaveCount,
  leaveVariables,
} from '../render/approval.js';

const listFilters = {
  page: z.number().int().min(1).default(1).describe('1-based page number'),
  size: z.number().int().min(1).default(20).describe('Items per page'),
  searchtype: z.string().optional().describe('Search field'),
  keyword: z.string().optional().describe('Search keyword'),
  duration: z.string().optional().describe('all or period'),
  from_date: z.string().optional().describe('YYYY-MM-DD'),
  to_date: z.string().optional().describe('YYYY-MM-DD'),
};

export const approvalTodo = defineOperation({
  id: 'approval.todo',
  tool: 'approval_todo',
  cli: ['approval', 'todo'],
  summary: 'List approval todo items',
  input: z.strictObject({
    type: z.enum(APPROVAL_TODO_KINDS).default('all').describe('Todo bucket'),
    ...listFilters,
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await approvalList(ctx.baseUrl(), ctx.session, input.type, {
      page: input.page,
      size: input.size,
      searchtype: input.searchtype,
      keyword: input.keyword,
      duration: input.duration,
      fromDate: input.from_date,
      toDate: input.to_date,
    });
    return rawResult(raw, formatApprovalList(raw, 'todo'));
  },
});

export const approvalReference = defineOperation({
  id: 'approval.reference',
  tool: 'approval_reference',
  cli: ['approval', 'reference'],
  summary: 'List approval reference/read/view items',
  input: z.strictObject({
    kind: z.enum(APPROVAL_REFERENCE_KINDS).default('reference').describe('Reference bucket'),
    ...listFilters,
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await approvalList(ctx.baseUrl(), ctx.session, input.kind, {
      page: input.page,
      size: input.size,
      searchtype: input.searchtype,
      keyword: input.keyword,
      duration: input.duration,
      fromDate: input.from_date,
      toDate: input.to_date,
    });
    return rawResult(raw, formatApprovalList(raw, 'reference'));
  },
});

export const approvalCountOp = defineOperation({
  id: 'approval.count',
  tool: 'approval_count',
  cli: ['approval', 'count'],
  summary: 'Get the approval todo count',
  input: z.strictObject({}),
  auth: true,
  run: async (ctx) => {
    const raw = await approvalCount(ctx.baseUrl(), ctx.session);
    return rawResult(raw, formatApprovalCount(raw));
  },
});

export const approvalLeaveCountOp = defineOperation({
  id: 'approval.leave_count',
  tool: 'approval_leave_count',
  cli: ['leavecount'],
  summary: 'Show annual leave usage and balance',
  input: z.strictObject({
    form_id: z.number().int().min(1).default(4621).describe('Leave request form id'),
    dept_id: z.number().int().min(1).default(159).describe('Department id'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await approvalLeaveCount(ctx.baseUrl(), ctx.session, input.form_id, input.dept_id);
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

export const approvalFormTree = defineOperation({
  id: 'approval.form.tree',
  tool: 'approval_form_tree',
  cli: ['approval', 'forms'],
  summary: 'Browse the approval form catalogue',
  input: z.strictObject({
    folder_id: z.number().int().min(1).optional().describe('Expand a single folder instead of the whole tree'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const nodes = input.folder_id === undefined
      ? await fetchFormTreeDeep(ctx.baseUrl(), ctx.session)
      : await fetchFormTree(ctx.baseUrl(), ctx.session, input.folder_id);
    return { data: nodes, text: formatFormTree(nodes) };
  },
});

export const approvalFormSearch = defineOperation({
  id: 'approval.form.search',
  tool: 'approval_form_search',
  cli: ['approval', 'form-search'],
  summary: 'Find an approval form by name and get its form id',
  input: z.strictObject({
    query: z.string().optional().describe('Form name fragment; omit to list every form'),
    limit: z.number().int().min(1).default(30).describe('Maximum results'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const forms = flattenForms(await fetchFormTreeDeep(ctx.baseUrl(), ctx.session));
    const needle = input.query?.trim().toLowerCase() ?? '';
    const matched = needle
      ? forms.filter((form) => `${form.folderPath.join(' ')} ${form.title}`.toLowerCase().includes(needle))
      : forms;
    const shown = matched.slice(0, input.limit);
    return { data: { total: forms.length, matched: matched.length, forms: shown }, text: formatFormSearch(shown, forms.length) };
  },
});

export const approvalBox = defineOperation({
  id: 'approval.box',
  tool: 'approval_box',
  cli: ['approval', 'box'],
  summary: 'List an approval document box (기안/임시/결재/참조/수신/발송/공문)',
  input: z.strictObject({
    kind: z.enum(DOCUMENT_BOX_KINDS).default('draft').describe('Which document box to open'),
    page: z.number().int().min(1).default(1).describe('1-based page number'),
    size: z.number().int().min(1).default(20).describe('Items per page'),
    searchtype: z.string().optional().describe('Search field'),
    keyword: z.string().optional().describe('Search keyword'),
    from_date: z.string().optional().describe('YYYY-MM-DD'),
    to_date: z.string().optional().describe('YYYY-MM-DD'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await fetchDocumentBox(ctx.baseUrl(), ctx.session, input.kind, {
      page: input.page,
      size: input.size,
      searchtype: input.searchtype,
      keyword: input.keyword,
      fromDate: input.from_date,
      toDate: input.to_date,
    });
    return rawResult(raw, formatDocumentBox(raw, DOCUMENT_BOXES[input.kind].label));
  },
});

export const approvalDocumentGet = defineOperation({
  id: 'approval.document',
  tool: 'approval_document',
  cli: ['approval', 'document'],
  summary: 'Show one approval document by id, including saved drafts',
  input: z.strictObject({
    document_id: z.number().int().min(1).describe('Document id, e.g. the one returned by approval draft'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await approvalDocument(ctx.baseUrl(), ctx.session, input.document_id);
    return rawResult(raw, formatDocument(raw));
  },
});

export const approvalDraftCreate = defineOperation({
  id: 'approval.draft.create',
  tool: 'approval_draft_create',
  cli: ['approval', 'draft'],
  summary: 'Create an approval document and save it to the 임시저장함 (never submits it)',
  input: z.strictObject({
    form_id: z.number().int().min(1).describe('Form id from approval form-search'),
    dept_id: z.number().int().min(1).optional().describe('Drafting department; resolved from the org chart when omitted'),
    title: z.string().optional().describe('Document title; defaults to the form name'),
    content: z.string().optional().describe('HTML body; defaults to the untouched form template'),
    variables: z.record(z.string(), z.unknown()).optional().describe('Form variables merged into the document'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const baseUrl = ctx.baseUrl();
    let deptId = input.dept_id;
    if (deptId === undefined) {
      const user = await userSession(baseUrl, ctx.session);
      deptId = await resolveDeptId(baseUrl, ctx.session, user.id);
      if (deptId === undefined) throw new Error('could not resolve the drafting department; pass --dept-id');
    }

    const blank = await documentNew(baseUrl, ctx.session, input.form_id, deptId);
    const raw = await documentTempSave(baseUrl, ctx.session, blank, input.form_id, deptId, {
      title: input.title,
      content: input.content,
      variables: input.variables,
    });
    return rawResult(raw, formatDraftSaved(raw, input.form_id, deptId));
  },
});

export const approvalOperations = [
  approvalTodo,
  approvalReference,
  approvalCountOp,
  approvalLeaveCountOp,
  approvalFormTree,
  approvalFormSearch,
  approvalDraftCreate,
  approvalBox,
  approvalDocumentGet,
];
