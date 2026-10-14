import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { joinUrl, requestText } from '../core/http.js';
import type { Config, Session } from '../core/types.js';
import { userSession } from '../core/auth.js';
import { sendViaSmtp, smtpSettings } from './smtp.js';

export type MailAction = 'list' | 'search' | 'delete' | 'send' | 'imageUpload';

/**
 * Known endpoints per action, most preferred first. A configured override
 * (config file or `DAOU_MAIL_*_URL`) is tried before these.
 */
const MAIL_ENDPOINTS: Record<MailAction, { configKey: keyof Config; candidates: string[] }> = {
  list: {
    configKey: 'mail_list_url',
    candidates: ['/api/mail/message/list', '/api/mail/list', '/api/mail/message/all', '/api/mail/inbox', '/api/mail/messages'],
  },
  search: {
    configKey: 'mail_search_url',
    candidates: ['/api/mail/message/list', '/api/mail/list', '/api/mail/message/all', '/api/mail/inbox', '/api/mail/messages'],
  },
  delete: {
    configKey: 'mail_delete_url',
    candidates: ['/api/mail/message/delete', '/api/mail/delete', '/api/mail/message/clean', '/api/mail/message/all'],
  },
  send: {
    configKey: 'mail_send_url',
    candidates: ['/api/mail/message/send'],
  },
  imageUpload: {
    configKey: 'mail_image_upload_url',
    candidates: ['/api/mail/image/upload'],
  },
};

export function normalizeMailFolder(folder: string): string {
  const value = folder.trim();
  if (!value) return 'Inbox';
  if (/^inbox$/i.test(value)) return 'Inbox';
  if (/^sent$/i.test(value)) return 'Sent';
  if (/^drafts?$/i.test(value)) return 'Drafts';
  if (/^trash$/i.test(value)) return 'Trash';
  if (/^spam$/i.test(value)) return 'Spam';
  if (/^all$/i.test(value)) return 'all';
  return value;
}

export function normalizeMailIds(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function endpointUrls(cfg: Config, baseUrl: string, action: MailAction): string[] {
  const spec = MAIL_ENDPOINTS[action];
  const configured = (cfg[spec.configKey] as string | undefined)?.trim() ?? '';
  const ordered = configured ? [configured, ...spec.candidates] : spec.candidates;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of ordered) {
    const url = joinUrl(baseUrl, candidate);
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** Try each known endpoint until one answers with usable JSON. */
async function callMailAction(
  cfg: Config,
  session: Session,
  baseUrl: string,
  action: Exclude<MailAction, 'imageUpload'>,
  method: 'GET' | 'POST',
  query: URLSearchParams | null,
  body: unknown,
): Promise<string> {
  let lastErr: Error | null = null;
  for (const target of endpointUrls(cfg, baseUrl, action)) {
    const url = new URL(target);
    if (query && method === 'GET') {
      for (const [key, value] of query.entries()) url.searchParams.append(key, value);
    }
    const { status, text } = await requestText(url.toString(), {
      method,
      body: method === 'GET' || body == null ? undefined : JSON.stringify(body),
      headers: method === 'GET'
        ? { Accept: 'application/json, text/plain, */*' }
        : { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    }, session);

    if (status >= 400) {
      lastErr = new Error(`${action} http ${status}: ${text.trim()}`);
      continue;
    }
    const trimmed = text.trim();
    if (!trimmed) return JSON.stringify({ endpoint: url.toString(), status, ok: true });
    if (trimmed.startsWith('<')) {
      lastErr = new Error(`${action} returned html from ${url.toString()}`);
      continue;
    }
    return trimmed;
  }
  throw lastErr ?? new Error(`${action} request failed`);
}

export async function listMail(cfg: Config, session: Session, baseUrl: string, folder: string, page: number, size: number): Promise<string> {
  const normalized = normalizeMailFolder(folder);
  const body = { folder: normalized, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, baseUrl, 'list', 'POST', null, body);
  } catch {
    const params = new URLSearchParams({
      folder: normalized,
      page: String(page),
      size: String(size),
      offset: String(size),
      limit: String(size),
    });
    return callMailAction(cfg, session, baseUrl, 'list', 'GET', params, null);
  }
}

export async function searchMail(cfg: Config, session: Session, baseUrl: string, folder: string, query: string, page: number, size: number): Promise<string> {
  const normalized = normalizeMailFolder(folder);
  const body = { folder: normalized, query, q: query, keyword: query, keyWord: query, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, baseUrl, 'search', 'POST', null, body);
  } catch {
    const params = new URLSearchParams({
      folder: normalized,
      query,
      q: query,
      keyword: query,
      keyWord: query,
      page: String(page),
      size: String(size),
      offset: String(size),
      limit: String(size),
    });
    return callMailAction(cfg, session, baseUrl, 'search', 'GET', params, null);
  }
}

export async function deleteMail(cfg: Config, session: Session, baseUrl: string, ids: string[], folder: string): Promise<string> {
  const normalized = normalizeMailFolder(folder);
  const payload = {
    folderNames: [normalized],
    uids: ids,
    folder: normalized,
    id: ids[0] ?? '',
    ids,
    mailId: ids[0] ?? '',
    mailIds: ids,
    messageId: ids[0] ?? '',
    messageIds: ids,
  };
  return callMailAction(cfg, session, baseUrl, 'delete', 'POST', null, payload);
}

export async function uploadMailImage(cfg: Config, session: Session, baseUrl: string, imagePath: string): Promise<string> {
  const file = await readFile(imagePath);
  let lastErr: Error | null = null;
  for (const target of endpointUrls(cfg, baseUrl, 'imageUpload')) {
    const form = new FormData();
    form.set('uploadType', 'flash');
    form.set('NewFile', new Blob([file]), basename(imagePath));
    const { status, text } = await requestText(target, { method: 'POST', body: form }, session);
    if (status >= 400) {
      lastErr = new Error(`image upload http ${status}: ${text.trim()}`);
      continue;
    }
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('<')) {
      lastErr = new Error(`image upload returned invalid response from ${target}`);
      continue;
    }
    return trimmed;
  }
  throw lastErr ?? new Error('image upload request failed');
}

function uploadedImageTag(raw: string): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const data = (parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed) as Record<string, unknown>;
  const fileUrl = [data.fileURL, data.url, data.fileUrl].find((v): v is string => typeof v === 'string' && v.length > 0);
  if (!fileUrl) throw new Error('mail image upload response missing fileURL');
  const fileName = [data.fileName, data.name].find((v): v is string => typeof v === 'string') ?? '';
  const safeTitle = fileName.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<img src="${fileUrl}" title="${safeTitle}">`;
}

function senderEmail(cfg: Config, session: Session, explicit?: string): string {
  const candidates = [
    explicit,
    cfg.mail_sender_email,
    cfg.username?.includes('@') ? cfg.username : '',
    session.username?.includes('@') ? session.username : '',
  ];
  return candidates.map((v) => v?.trim() ?? '').find(Boolean) ?? '';
}

function senderName(cfg: Config, explicit?: string): string {
  return [explicit, cfg.mail_sender_name, cfg.username].map((v) => v?.trim() ?? '').find(Boolean) ?? '';
}

/**
 * Sender address and name: explicit flags, then saved config, then the signed-in
 * user's own groupware profile, so nobody has to configure them by hand.
 */
async function resolveSender(cfg: Config, session: Session, baseUrl: string, options: SendMailOptions): Promise<{ email: string; name: string }> {
  const email = senderEmail(cfg, session, options.senderEmail);
  const name = [options.senderName, cfg.mail_sender_name].map((v) => v?.trim() ?? '').find(Boolean) ?? '';
  if (email && name) return { email, name };
  const profile = await userSession(baseUrl, session).catch(() => null);
  return {
    email: email || profile?.email?.trim() || '',
    name: name || profile?.name?.trim() || senderName(cfg),
  };
}

function normalizeReservedDate(value?: string): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.toISOString().split('.')[0]}+00:00`;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  content: string;
  cc?: string;
  bcc?: string;
  senderEmail?: string;
  senderName?: string;
  imagePath?: string;
  reservedAt?: string;
  receiveNoti?: boolean;
  saveSent?: boolean;
  transport?: MailTransport;
}

export const MAIL_TRANSPORTS = ['auto', 'smtp', 'web'] as const;
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

function withTransport(raw: string, extra: Record<string, unknown>): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const base = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { response: raw };
  return JSON.stringify({ ...base, ...extra });
}

/**
 * Send through the groupware's SMTP server first and fall back to the web API.
 * `auto` (default) uses SMTP when a password is saved and the mail needs no
 * web-only feature (inline image upload, reserved sending); any SMTP failure
 * then retries over the web API. `smtp` / `web` force one path.
 */
export async function sendMail(cfg: Config, session: Session, baseUrl: string, requested: SendMailOptions): Promise<string> {
  const sender = await resolveSender(cfg, session, baseUrl, requested);
  const options = { ...requested, senderEmail: sender.email, senderName: sender.name };
  const configured = MAIL_TRANSPORTS.find((t) => t === cfg.mail_transport?.trim());
  const transport: MailTransport = options.transport ?? configured ?? 'auto';
  const webOnly = Boolean(options.imagePath?.trim() || options.reservedAt?.trim());
  if (transport === 'web' || (transport === 'auto' && webOnly)) {
    return withTransport(await sendMailWeb(cfg, session, baseUrl, options), { transport: 'web' });
  }
  if (webOnly) throw new Error('image and reserved sending need the web transport');

  const to = options.to.trim();
  const subject = options.subject.trim();
  if (!to) throw new Error('to required');
  if (!subject) throw new Error('subject required');
  if (!options.content.trim()) throw new Error('content or image required');
  const from = senderEmail(cfg, session, options.senderEmail);
  if (!from) throw new Error('sender email required; pass --from-email or set DAOU_MAIL_SENDER_EMAIL');

  const settings = smtpSettings(cfg, baseUrl, from);
  if (!settings) {
    if (transport === 'smtp') throw new Error('smtp needs a saved password (daou-gw-cli config set --password)');
    return withTransport(await sendMailWeb(cfg, session, baseUrl, options), { transport: 'web', fallback: 'no saved password for smtp' });
  }

  try {
    return await sendViaSmtp(settings, {
      from,
      fromName: options.senderName,
      to,
      cc: options.cc?.trim(),
      bcc: options.bcc?.trim(),
      subject,
      html: options.content,
      readReceipt: options.receiveNoti,
      saveSent: options.saveSent,
    });
  } catch (err) {
    if (transport === 'smtp') throw err;
    const reason = err instanceof Error ? err.message : String(err);
    return withTransport(await sendMailWeb(cfg, session, baseUrl, options), { transport: 'web', fallback: `smtp failed: ${reason}` });
  }
}

async function sendMailWeb(cfg: Config, session: Session, baseUrl: string, options: SendMailOptions): Promise<string> {
  const to = options.to.trim();
  const subject = options.subject.trim();
  if (!to) throw new Error('to required');
  if (!subject) throw new Error('subject required');

  let content = options.content;
  if (options.imagePath?.trim()) {
    const uploaded = await uploadMailImage(cfg, session, baseUrl, options.imagePath.trim());
    content = `${content}${content.trim() ? '<br>' : ''}${uploadedImageTag(uploaded)}`;
  }
  if (!content.trim()) throw new Error('content or image required');

  const from = senderEmail(cfg, session, options.senderEmail);
  if (!from) throw new Error('sender email required; pass --from-email or set DAOU_MAIL_SENDER_EMAIL');

  const reservedDateUtc = normalizeReservedDate(options.reservedAt);
  const reserveMail = Boolean(reservedDateUtc);
  const payload = {
    senderEmail: from,
    senderName: senderName(cfg, options.senderName),
    sendType: reserveMail ? 'reserved' : 'normal',
    sendFlag: 'normal',
    charset: 'UTF-8',
    attachsign: false,
    signSeq: '',
    signLocation: 'outside',
    bannerDisplay: false,
    to,
    cc: options.cc?.trim() ?? '',
    bcc: options.bcc?.trim() ?? '',
    massMode: false,
    attachSign: false,
    senderMode: false,
    useAliasEmail: false,
    subject,
    writeMode: 'html',
    content,
    receiveNoti: options.receiveNoti ?? true,
    reserveMail,
    reservedDateUtc,
    saveSent: options.saveSent ?? true,
    attachList: '',
    bigAttachContent: '',
    bigAttachMode: false,
    bigAttachLinks: null,
    sharedFlag: 'user',
    sharedUserSeq: '0',
    sharedFolderName: '',
  };
  return callMailAction(cfg, session, baseUrl, 'send', 'POST', null, payload);
}
