import { z } from 'zod';
import { boardPostAttach, boardPostCreate, boardPostUpdate } from '../api/board.js';
import { defineOperation, rawResult } from '../core/registry.js';
import { formatBoardResult } from '../render/board.js';

const contentDescription = 'HTML body; `src="[{/local/path}]"` placeholders are uploaded and rewritten';

export const boardPostCreateOp = defineOperation({
  id: 'board.create',
  tool: 'board_post_create',
  cli: ['board', 'create'],
  summary: 'Create a board post',
  input: z.strictObject({
    board_id: z.number().int().min(1).describe('Target board id'),
    subject: z.string().min(1).describe('Post title'),
    content: z.string().min(1).describe(contentDescription),
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await boardPostCreate(ctx.cfg, ctx.session, ctx.baseUrl(), input.board_id, input.subject, input.content);
    return rawResult(raw, formatBoardResult(raw, 'create'));
  },
});

export const boardPostUpdateOp = defineOperation({
  id: 'board.update',
  tool: 'board_post_update',
  cli: ['board', 'update'],
  summary: 'Update a board post',
  input: z.strictObject({
    board_id: z.number().int().min(1).describe('Target board id'),
    post_id: z.number().int().min(1).describe('Post id to update'),
    subject: z.string().min(1).describe('Post title'),
    content: z.string().min(1).describe(contentDescription),
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await boardPostUpdate(ctx.cfg, ctx.session, ctx.baseUrl(), input.board_id, input.post_id, input.subject, input.content);
    return rawResult(raw, formatBoardResult(raw, 'update'));
  },
});

export const boardPostAttachOp = defineOperation({
  id: 'board.attach',
  tool: 'board_post_attach',
  cli: ['board', 'attach'],
  summary: 'Attach a local file to an existing board post',
  input: z.strictObject({
    board_id: z.number().int().min(1).describe('Target board id'),
    post_id: z.number().int().min(1).describe('Post id to attach to'),
    file_path: z.string().min(1).describe('Local file path; Windows paths are accepted'),
  }),
  cliAlias: { file_path: 'file' },
  auth: true,
  run: async (ctx, input) => {
    const raw = await boardPostAttach(ctx.cfg, ctx.session, ctx.baseUrl(), input.board_id, input.post_id, input.file_path);
    return rawResult(raw, formatBoardResult(raw, 'attach'));
  },
});

export const boardOperations = [boardPostCreateOp, boardPostUpdateOp, boardPostAttachOp];
