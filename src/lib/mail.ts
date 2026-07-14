import { basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Config, Session } from './types.js';
import { requestText } from './http.js';

export function resolveMailEndpoint(baseURL: string, configured: string, envKey: string, defaultCandidate: string, candidates: string[]): string {
  const direct = configured.trim();
  if (direct) return direct;
  if (envKey) {
    const env = (process.env[envKey] ?? '').trim();
    if (env) return env;
  }
  if (defaultCandidate.trim()) return defaultCandidate;
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export function normalizeMailIDs(input: string[]): string[] {
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

export function normalizeMailFolder(folder: string): string {
  const s = folder.trim();
  if (!s) return 'Inbox';
  if (/^inbox$/i.test(s)) return 'Inbox';
  if (/^sent$/i.test(s)) return 'Sent';
  if (/^drafts?$/i.test(s)) return 'Drafts';
  if (/^trash$/i.test(s)) return 'Trash';
  if (/^spam$/i.test(s)) return 'Spam';
  if (/^all$/i.test(s)) return 'all';
  return s;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function joinBaseURL(baseURL: string, endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${trimBase(baseURL)}/${trimmed.replace(/^\//, '')}`;
}

function candidateURLs(baseURL: string, endpoint: string, candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  if (endpoint) add(joinBaseURL(baseURL, endpoint));
  for (const c of candidates) add(joinBaseURL(baseURL, c));
  return out;
}

type MailAction = 'list' | 'search' | 'delete' | 'send' | 'imageUpload';

export interface SendMailOptions {
  to: string;
  subject: string;
  content: string;
  cc?: string;
  bcc?: string;
  senderEmail?: string;
  senderName?: string;
  imagePath?: string;
  reserveMail?: boolean;
  reservedDateUtc?: string;
  receiveNoti?: boolean;
  saveSent?: boolean;
}

function mailConfiguredURL(cfg: Config, action: MailAction): string {
  if (action === 'list') return cfg.mail_list_url ?? '';
  if (action === 'search') return cfg.mail_search_url ?? '';
  if (action === 'delete') return cfg.mail_delete_url ?? '';
  if (action === 'send') return cfg.mail_send_url ?? '';
  return cfg.mail_image_upload_url ?? '';
}

function mailEnvKey(action: MailAction): string {
  if (action === 'list') return 'DAOU_MAIL_LIST_URL';
  if (action === 'search') return 'DAOU_MAIL_SEARCH_URL';
  if (action === 'delete') return 'DAOU_MAIL_DELETE_URL';
  if (action === 'send') return 'DAOU_MAIL_SEND_URL';
  return 'DAOU_MAIL_IMAGE_UPLOAD_URL';
}

function mailDefaultCandidate(action: MailAction): string {
  if (action === 'delete') return '/api/mail/message/delete';
  if (action === 'send') return '/api/mail/message/send';
  if (action === 'imageUpload') return '/api/mail/image/upload';
  return '/api/mail/message/list';
}

function mailFallbackCandidates(action: MailAction): string[] {
  if (action === 'delete') return ['/api/mail/message/delete', '/api/mail/delete', '/api/mail/message/clean', '/api/mail/message/all'];
  if (action === 'send') return ['/api/mail/message/send'];
  if (action === 'imageUpload') return ['/api/mail/image/upload'];
  return ['/api/mail/message/list', '/api/mail/list', '/api/mail/message/all', '/api/mail/inbox', '/api/mail/messages'];
}

async function callMailAction(cfg: Config, session: Session, action: 'list' | 'search' | 'delete' | 'send', method: 'GET' | 'POST', query: URLSearchParams | null, body: unknown): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const endpoint = resolveMailEndpoint(baseUrl, mailConfiguredURL(cfg, action), mailEnvKey(action), mailDefaultCandidate(action), mailFallbackCandidates(action));
  const urls = candidateURLs(baseUrl, endpoint, mailFallbackCandidates(action));
  let lastErr: Error | null = null;
  for (const target of urls) {
    const url = new URL(target);
    if (query && method === 'GET') {
      for (const [k, v] of Array.from(query.entries())) url.searchParams.append(k, v);
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
    if (!trimmed) {
      return JSON.stringify({ endpoint: url.toString(), status, ok: true });
    }
    if (trimmed.startsWith('<')) {
      lastErr = new Error(`${action} returned html from ${url.toString()}`);
      continue;
    }
    return trimmed;
  }
  throw lastErr ?? new Error(`${action} request failed`);
}

function envFallback(key: string): string {
  return (process.env[key] ?? '').trim();
}

function normalizeReservedDate(value?: string): string {
  const raw = value?.trim() ?? '';
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.toISOString().split('.')[0]}+00:00`;
}

function senderEmailFrom(cfg: Config, session: Session, explicit?: string): string {
  const candidates = [
    explicit,
    cfg.mail_sender_email,
    envFallback('DAOU_MAIL_SENDER_EMAIL'),
    cfg.username?.includes('@') ? cfg.username : '',
    session.username?.includes('@') ? session.username : '',
  ];
  return candidates.map((v) => v?.trim() ?? '').find(Boolean) ?? '';
}

function senderNameFrom(cfg: Config, explicit?: string): string {
  const candidates = [explicit, cfg.mail_sender_name, envFallback('DAOU_MAIL_SENDER_NAME'), cfg.username];
  return candidates.map((v) => v?.trim() ?? '').find(Boolean) ?? '';
}

function extractUploadedImageTag(raw: string): string {
  const parsed = JSON.parse(raw) as Record<string, any>;
  const data = (parsed.data && typeof parsed.data === 'object') ? parsed.data as Record<string, any> : parsed;
  const fileURL = typeof data.fileURL === 'string'
    ? data.fileURL
    : typeof data.url === 'string'
      ? data.url
      : typeof data.fileUrl === 'string'
        ? data.fileUrl
        : '';
  const fileName = typeof data.fileName === 'string'
    ? data.fileName
    : typeof data.name === 'string'
      ? data.name
      : '';
  if (!fileURL) throw new Error('mail image upload response missing fileURL');
  const safeTitle = fileName.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<img src="${fileURL}" title="${safeTitle}">`;
}

export async function uploadMailImage(cfg: Config, session: Session, imagePath: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const endpoint = resolveMailEndpoint(baseUrl, mailConfiguredURL(cfg, 'imageUpload'), mailEnvKey('imageUpload'), mailDefaultCandidate('imageUpload'), mailFallbackCandidates('imageUpload'));
  const urls = candidateURLs(baseUrl, endpoint, mailFallbackCandidates('imageUpload'));
  const file = await readFile(imagePath);
  let lastErr: Error | null = null;
  for (const target of urls) {
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

export async function sendMail(cfg: Config, session: Session, options: SendMailOptions): Promise<string> {
  const to = options.to.trim();
  const subject = options.subject.trim();
  if (!to) throw new Error('to required');
  if (!subject) throw new Error('subject required');
  let content = options.content;
  if (options.imagePath?.trim()) {
    const imageUploadRaw = await uploadMailImage(cfg, session, options.imagePath.trim());
    content = `${content}${content.trim() ? '<br>' : ''}${extractUploadedImageTag(imageUploadRaw)}`;
  }
  if (!content.trim()) throw new Error('content or image required');
  const senderEmail = senderEmailFrom(cfg, session, options.senderEmail);
  if (!senderEmail) throw new Error('sender email required; pass --from-email or set DAOU_MAIL_SENDER_EMAIL');
  const senderName = senderNameFrom(cfg, options.senderName);
  const reservedDateUtc = normalizeReservedDate(options.reservedDateUtc);
  const reserveMail = options.reserveMail === true || !!reservedDateUtc;
  const payload = {
    senderEmail,
    senderName,
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
  return callMailAction(cfg, session, 'send', 'POST', null, payload);
}

export async function listMail(cfg: Config, session: Session, folder: string, page: number, size: number): Promise<string> {
  const normalizedFolder = normalizeMailFolder(folder);
  const params = new URLSearchParams();
  params.set('folder', normalizedFolder);
  params.set('page', String(page));
  params.set('size', String(size));
  params.set('offset', String(size));
  params.set('limit', String(size));
  const body = { folder: normalizedFolder, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, 'list', 'POST', null, body);
  } catch {
    return callMailAction(cfg, session, 'list', 'GET', params, null);
  }
}

export async function searchMail(cfg: Config, session: Session, folder: string, query: string, page: number, size: number): Promise<string> {
  const normalizedFolder = normalizeMailFolder(folder);
  const params = new URLSearchParams();
  params.set('folder', normalizedFolder);
  params.set('query', query);
  params.set('q', query);
  params.set('keyword', query);
  params.set('keyWord', query);
  params.set('page', String(page));
  params.set('size', String(size));
  params.set('offset', String(size));
  params.set('limit', String(size));
  const body = { folder: normalizedFolder, query, q: query, keyword: query, keyWord: query, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, 'search', 'POST', null, body);
  } catch {
    return callMailAction(cfg, session, 'search', 'GET', params, null);
  }
}

export async function deleteMail(cfg: Config, session: Session, ids: string[], folder: string): Promise<string> {
  const normalizedFolder = normalizeMailFolder(folder);
  const payload = {
    folderNames: [normalizedFolder],
    uids: ids,
    folder: normalizedFolder,
    id: ids[0] ?? '',
    ids,
    mailId: ids[0] ?? '',
    mailIds: ids,
    messageId: ids[0] ?? '',
    messageIds: ids,
  };
  return callMailAction(cfg, session, 'delete', 'POST', null, payload);
}
