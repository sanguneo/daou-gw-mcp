import { promises as fs } from 'node:fs';
import { requestText } from './http.js';
import type { Config, Session } from './types.js';

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function joinBaseURL(baseURL: string, endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${trimBase(baseURL)}/${trimmed.replace(/^\//, '')}`;
}

function resolveBoardEndpoint(baseUrl: string, configured: string | undefined, fallback: string): string {
  const direct = (configured ?? '').trim();
  if (direct) return joinBaseURL(baseUrl, direct);
  return joinBaseURL(baseUrl, fallback);
}

function parseJsonMaybe(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: text };
  }
}

function toWslPath(inputPath: string): string {
  const p = inputPath.trim();
  const m = p.match(/^([a-zA-Z]):\\(.*)$/);
  if (!m) return p;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, '/');
  return `/mnt/${drive}/${rest}`;
}

async function fetchPostForUpdate(cfg: Config, session: Session, boardId: number, postId: number): Promise<{ attaches: Array<{ id?: number | string; name?: string }> }> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) return { attaches: [] };
  const url = `${trimBase(baseUrl)}/api/board/${boardId}/post/${postId}`;
  const out = await requestText(url, {
    method: 'GET',
    headers: { Accept: 'application/json, text/plain, */*' },
  }, session);
  if (out.status >= 400) return { attaches: [] };
  const parsed = parseJsonMaybe(out.text) as { data?: { attaches?: Array<{ id?: number | string; name?: string }> } };
  return { attaches: parsed?.data?.attaches ?? [] };
}

export function buildAttachmentUrl(baseUrl: string, boardId: number, postId: number, attachId: number | string): string {
  return `${trimBase(baseUrl)}/api/board/${boardId}/post/${postId}/attaches/${attachId}`;
}

export async function boardPostCreate(cfg: Config, session: Session, boardId: number, subject: string, content: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const url = resolveBoardEndpoint(baseUrl, cfg.board_create_url, `/api/board/${boardId}/post`);
  const resolved = await resolveInlineMedia(cfg, session, content);
  const resolvedContent = resolved.content;
  const payload = {
    boardId: String(boardId),
    notiMailFlag: false,
    notiPushFlag: false,
    postId: '',
    writeType: '',
    publicWriter: false,
    title: subject,
    content: resolvedContent,
    contentType: 'HTML',
    modifyPCWebPlatform: true,
    attaches: resolved.attaches,
    status: 'OPEN',
    authorizedUsers: [],
    stickable: false,
  };
  let { status, text } = await requestText(url, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
  }, session);

  const hasInlineImage = /<img\b/i.test(resolvedContent);
  const attachNotFound = /attach\.not\.found/i.test(text);
  if (status >= 400 && hasInlineImage && attachNotFound) {
    const legacyPayload = { subject, content: resolvedContent, attaches: resolved.attaches };
    const retry = await requestText(url, {
      method: 'POST',
      body: JSON.stringify(legacyPayload),
      headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    }, session);
    status = retry.status;
    text = retry.text;
  }

  if (status >= 400) throw new Error(`board create http ${status}: ${text.trim()}`);

  if (resolved.videoRewrites.length > 0) {
    const postId = extractPostId(text);
    if (postId) {
      const existing = await fetchPostForUpdate(cfg, session, boardId, postId);
      const rewritten = replaceVideoTempSrcWithAttachUrl(resolvedContent, boardId, postId, existing.attaches, resolved.videoRewrites);
      if (rewritten !== resolvedContent) {
        await boardPostUpdate(cfg, session, boardId, postId, subject, rewritten);
      }
    }
  }

  return text.trim() ? text : JSON.stringify({ ok: true, boardId });
}

export async function boardPostUpdate(cfg: Config, session: Session, boardId: number, postId: number, subject: string, content: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const url = resolveBoardEndpoint(baseUrl, cfg.board_update_url, `/api/board/${boardId}/post/${postId}`);
  const resolved = await resolveInlineMedia(cfg, session, content);
  const resolvedContent = resolved.content;
  const existing = await fetchPostForUpdate(cfg, session, boardId, postId);
  const updateAttaches = existing.attaches
    .filter((a) => (typeof a.id === 'number' || typeof a.id === 'string') && typeof a.name === 'string')
    .map((a) => ({ id: String(a.id), name: String(a.name) }));
  const payload = {
    boardId: String(boardId),
    notiMailFlag: false,
    notiPushFlag: false,
    postId: String(postId),
    writeType: 'edit',
    publicWriter: false,
    title: subject,
    content: resolvedContent,
    contentType: 'HTML',
    modifyPCWebPlatform: true,
    attaches: updateAttaches,
    status: 'OPEN',
    authorizedUsers: [],
    stickable: false,
  };
  let { status, text } = await requestText(url, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
  }, session);

  const hasInlineImage = /<img\b/i.test(resolvedContent);
  const attachNotFound = /attach\.not\.found/i.test(text);
  if (status >= 400 && hasInlineImage && attachNotFound) {
    const legacyPayload = { subject, content: resolvedContent, attaches: updateAttaches };
    const retry = await requestText(url, {
      method: 'PUT',
      body: JSON.stringify(legacyPayload),
      headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    }, session);
    status = retry.status;
    text = retry.text;
  }

  if (status >= 400) throw new Error(`board update http ${status}: ${text.trim()}`);
  return text.trim() ? text : JSON.stringify({ ok: true, boardId, postId });
}

export async function boardPostAttach(cfg: Config, session: Session, boardId: number, postId: number, filePath: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const url = resolveBoardEndpoint(baseUrl, cfg.board_attach_url, `/api/board/${boardId}/post/${postId}/attaches`);
  const resolvedPath = toWslPath(filePath);
  const file = await fs.readFile(resolvedPath);
  const fileName = resolvedPath.split('/').pop() || 'upload.bin';
  const form = new FormData();
  form.set('file', new Blob([file]), fileName);
  const { status, text } = await requestText(url, {
    method: 'POST',
    body: form,
    headers: { Accept: 'application/json, text/plain, */*' },
  }, session);
  if (status >= 400) throw new Error(`board attach http ${status}: ${text.trim()}`);
  return text.trim() ? text : JSON.stringify({ ok: true, boardId, postId, fileName });
}

export async function boardImageUpload(cfg: Config, session: Session, filePath: string, gossoCookie?: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const endpoint = cfg.board_image_upload_url?.trim() || '/api/file';
  const urlObj = new URL(resolveBoardEndpoint(baseUrl, endpoint, '/api/file'));
  const cookie = (gossoCookie ?? '').trim();
  if (cookie) urlObj.searchParams.set('GOSSOcookie', cookie);

  const resolvedPath = toWslPath(filePath);
  const file = await fs.readFile(resolvedPath);
  const fileName = resolvedPath.split('/').pop() || 'upload.bin';
  const form = new FormData();
  form.set('writeSecret', 'OPEN');
  form.set('file', new Blob([file]), fileName);

  const { status, text } = await requestText(urlObj.toString(), {
    method: 'POST',
    body: form,
    headers: {
      Accept: '*/*',
      'x-requested-with': 'XMLHttpRequest',
      timezoneoffset: '540',
    },
  }, session);
  if (status >= 400) throw new Error(`board image upload http ${status}: ${text.trim()}`);
  return text.trim() ? text : JSON.stringify({ ok: true, fileName });
}

type UploadedMedia = { hostId?: string; filePath?: string; fileExt?: string; thumbnail?: string };
type InlineAttach = { path: string; name: string; hostId: string };
type VideoRewrite = { fileName: string; tempSrc: string };

function pickUploadedSrc(data: UploadedMedia): string {
  const ext = (data.fileExt ?? '').toLowerCase();
  if ((ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') && data.thumbnail) {
    return data.thumbnail;
  }
  if (data.hostId && data.filePath) return `/temp/${data.hostId}${data.filePath}`;
  return data.filePath ?? '';
}

function replaceVideoTempSrcWithAttachUrl(content: string, boardId: number, postId: number, attaches: Array<{ id?: number | string; name?: string }>, rewrites: VideoRewrite[]): string {
  let out = content;
  for (const rw of rewrites) {
    const match = attaches.find((a) => (a.name ?? '') === rw.fileName && (typeof a.id === 'number' || typeof a.id === 'string'));
    if (!match?.id) continue;
    const apiUrl = `/api/board/${boardId}/post/${postId}/attaches/${String(match.id)}`;
    out = out.split(rw.tempSrc).join(apiUrl);
  }
  return out;
}

function extractPostId(raw: string): number | undefined {
  const parsed = parseJsonMaybe(raw) as { postId?: number | string; id?: number | string; data?: { id?: number | string; postId?: number | string } };
  const cand = parsed?.data?.id ?? parsed?.data?.postId ?? parsed?.postId ?? parsed?.id;
  const n = Number(cand);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function resolveInlineMedia(cfg: Config, session: Session, content: string): Promise<{ content: string; attaches: InlineAttach[]; videoRewrites: VideoRewrite[] }> {
  const re = /src=(["'])\[\{([^\]\}]+)\}\]\1/g;
  const matches = Array.from(content.matchAll(re));
  if (matches.length === 0) return { content, attaches: [], videoRewrites: [] };

  let output = content;
  const attaches: InlineAttach[] = [];
  const videoRewrites: VideoRewrite[] = [];
  for (const match of matches) {
    const original = match[0];
    const quote = match[1];
    const rawPath = match[2].trim();
    const localPath = toWslPath(rawPath);
    const fileName = localPath.split('/').pop() || 'upload.bin';
    const uploadRaw = await boardImageUpload(cfg, session, localPath);
    const parsed = parseJsonMaybe(uploadRaw) as { data?: UploadedMedia };
    const data = parsed.data ?? {};
    const ext = (data.fileExt ?? '').toLowerCase();

    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
      const src = data.hostId && data.filePath
        ? `/thumb/temp/${data.hostId}/original${data.filePath}`
        : pickUploadedSrc(data) || rawPath;
      output = output.replace(
        original,
        `data-filename=${quote}${fileName}${quote} data-filepath=${quote}${data.filePath ?? ''}${quote} data-hostid=${quote}${data.hostId ?? ''}${quote} data-inline=${quote}true${quote} src=${quote}${src}${quote}`,
      );
      continue;
    }

    if (data.hostId && data.filePath) {
      attaches.push({ path: data.filePath, name: fileName, hostId: data.hostId });
    }
    const src = pickUploadedSrc(data) || rawPath;
    if (src && /\.mp4$/i.test(fileName)) {
      videoRewrites.push({ fileName, tempSrc: src });
    }
    output = output.replace(original, `src=${quote}${src}${quote}`);
  }
  return { content: output, attaches, videoRewrites };
}

export async function resolveInlineMediaPlaceholders(cfg: Config, session: Session, content: string): Promise<string> {
  const out = await resolveInlineMedia(cfg, session, content);
  return out.content;
}

export function appendVideoTag(content: string, videoUrl: string): string {
  const safeUrl = videoUrl.trim();
  if (!safeUrl) return content;
  return `${content}\n<video controls width="640"><source src="${safeUrl}" type="video/mp4">HTML5 Video를 지원하지 않는 브라우저</video>`;
}

export function appendImageTag(content: string, imageUrl: string): string {
  const safeUrl = imageUrl.trim();
  if (!safeUrl) return content;
  return `${content}\n<p><img src="${safeUrl}" alt="" /></p>`;
}

export function summarizeBoardResult(raw: string, mode: 'create' | 'update' | 'attach'): string {
  const parsed = parseJsonMaybe(raw) as Record<string, unknown>;
  if (mode === 'attach') {
    const attachId = typeof parsed.attachId === 'number' || typeof parsed.attachId === 'string' ? parsed.attachId :
      typeof parsed.id === 'number' || typeof parsed.id === 'string' ? parsed.id : undefined;
    if (attachId !== undefined) return `attach ok: ${String(attachId)}\n`;
    return 'attach ok\n';
  }
  const postId = typeof parsed.postId === 'number' || typeof parsed.postId === 'string' ? parsed.postId :
    typeof parsed.id === 'number' || typeof parsed.id === 'string' ? parsed.id : undefined;
  if (postId !== undefined) return `${mode} ok: ${String(postId)}\n`;
  return `${mode} ok\n`;
}
