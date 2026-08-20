import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { deleteMail, listMail, normalizeMailIds, searchMail, sendMail } from '../api/mail.js';
import { defineOperation, rawResult } from '../core/registry.js';
import { formatMailAction, formatMailList } from '../render/mail.js';

const folder = z.string().optional().describe('Mail folder (Inbox, Sent, Drafts, Trash, Spam, all)');
const page = z.number().int().min(1).default(1).describe('1-based page number');
const size = z.number().int().min(1).default(20).describe('Items per page');

export const mailList = defineOperation({
  id: 'mail.list',
  tool: 'mail_list',
  cli: ['mail', 'list'],
  summary: 'List mail using the saved session',
  input: z.strictObject({ folder, page, size }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await listMail(ctx.cfg, ctx.session, ctx.baseUrl(), input.folder ?? 'Inbox', input.page, input.size);
    return rawResult(raw, formatMailList(raw, 'list', input.size));
  },
});

export const mailSearch = defineOperation({
  id: 'mail.search',
  tool: 'mail_search',
  cli: ['mail', 'search'],
  summary: 'Search mail using the saved session',
  input: z.strictObject({
    query: z.string().min(1).describe('Search keyword'),
    folder,
    page,
    size,
  }),
  auth: true,
  run: async (ctx, input) => {
    const raw = await searchMail(ctx.cfg, ctx.session, ctx.baseUrl(), input.folder ?? 'Inbox', input.query, input.page, input.size);
    return rawResult(raw, formatMailList(raw, 'search', input.size));
  },
});

export const mailDelete = defineOperation({
  id: 'mail.delete',
  tool: 'mail_delete',
  cli: ['mail', 'delete'],
  summary: 'Delete mail using the saved session',
  input: z.strictObject({
    ids: z.array(z.string().min(1)).min(1).optional().describe('Mail ids to delete'),
    id: z.string().min(1).optional().describe('Single mail id to delete'),
    folder,
  }),
  schemaExtra: { anyOf: [{ required: ['ids'] }, { required: ['id'] }] },
  cliAlias: { ids: 'id' },
  cliHidden: ['id'],
  auth: true,
  run: async (ctx, input) => {
    const ids = normalizeMailIds([...(input.ids ?? []), ...(input.id ? [input.id] : [])]);
    if (ids.length === 0) throw new Error('missing ids');
    const raw = await deleteMail(ctx.cfg, ctx.session, ctx.baseUrl(), ids, input.folder ?? 'Inbox');
    return rawResult(raw, formatMailAction(raw, 'delete'));
  },
});

export const mailSend = defineOperation({
  id: 'mail.send',
  tool: 'mail_send',
  cli: ['mail', 'send'],
  summary: 'Send HTML mail using the saved session',
  input: z.strictObject({
    to: z.string().min(1).describe('Recipient address(es), comma separated'),
    subject: z.string().min(1).describe('Mail subject'),
    content: z.string().optional().describe('HTML body'),
    cc: z.string().optional().describe('Cc address(es)'),
    bcc: z.string().optional().describe('Bcc address(es)'),
    sender_email: z.string().optional().describe('Override the sender address'),
    sender_name: z.string().optional().describe('Override the sender display name'),
    image_path: z.string().optional().describe('Local image appended to the body'),
    reserved_at: z.string().optional().describe('ISO timestamp; sending is reserved when set'),
    receive_noti: z.boolean().optional().describe('Request a read receipt'),
    save_sent: z.boolean().optional().describe('Keep a copy in Sent'),
  }),
  schemaExtra: { anyOf: [{ required: ['content'] }, { required: ['image_path'] }] },
  cliAlias: { sender_email: 'from-email', sender_name: 'from-name', image_path: 'image' },
  cliExtras: [
    {
      flag: '--html-file <path>',
      describe: 'Read the HTML body from a file',
      apply: async (value, input) => {
        if (!input.content) input.content = await readFile(value, 'utf8');
      },
    },
  ],
  auth: true,
  run: async (ctx, input) => {
    const raw = await sendMail(ctx.cfg, ctx.session, ctx.baseUrl(), {
      to: input.to,
      subject: input.subject,
      content: input.content ?? '',
      cc: input.cc,
      bcc: input.bcc,
      senderEmail: input.sender_email,
      senderName: input.sender_name,
      imagePath: input.image_path,
      reservedAt: input.reserved_at,
      receiveNoti: input.receive_noti,
      saveSent: input.save_sent,
    });
    return rawResult(raw, formatMailAction(raw, 'send'));
  },
});

export const mailOperations = [mailList, mailSearch, mailDelete, mailSend];
