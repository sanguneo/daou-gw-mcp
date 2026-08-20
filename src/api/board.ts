import { promises as fs } from 'node:fs';
import { joinUrl, parseJsonMaybe, requestText, trimBaseUrl } from '../core/http.js';
import type { Config, Session } from '../core/types.js';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);

/**
 * Under WSL a Windows path has to be reached through `/mnt`, so
 * `C:\dir\file.png` becomes `/mnt/c/dir/file.png`. On Windows itself the
 * original path is already correct and must be left alone.
 */
function toLocalPath(input: string): string {
  const value = input.trim();
  if (process.platform === 'win32') return value;
  const match = value.match(/^([a-zA-Z]):\\(.*)$/);
  if (!match) return value;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || 'upload.bin';
}

function endpoint(baseUrl: string, configured: string | undefined, fallback: string): string {
  const direct = (configured ?? '').trim();
  return joinUrl(baseUrl, direct || fallback);
}

interface UploadedMedia {
  hostId?: string;
  filePath?: string;
  fileExt?: string;
  thumbnail?: string;
}

interface InlineAttach {
  path: string;
  name: string;
  hostId: string;
}

interface VideoRewrite {
  fileName: string;
  tempSrc: string;
}

interface PostAttach {
  id?: number | string;
  name?: string;
}

function uploadedSrc(data: UploadedMedia): string {
  const ext = (data.fileExt ?? '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) && data.thumbnail) return data.thumbnail;
  if (data.hostId && data.filePath) return `/temp/${data.hostId}${data.filePath}`;
  return data.filePath ?? '';
}

function extractPostId(raw: string): number | undefined {
  const parsed = parseJsonMaybe(raw) as {
    postId?: number | string;
    id?: number | string;
    data?: { id?: number | string; postId?: number | string };
  };
  const candidate = parsed?.data?.id ?? parsed?.data?.postId ?? parsed?.postId ?? parsed?.id;
  const value = Number(candidate);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function fetchPostAttaches(baseUrl: string, session: Session, boardId: number, postId: number): Promise<PostAttach[]> {
  const out = await requestText(`${trimBaseUrl(baseUrl)}/api/board/${boardId}/post/${postId}`, {
    method: 'GET',
    headers: { Accept: 'application/json, text/plain, */*' },
  }, session);
  if (out.status >= 400) return [];
  const parsed = parseJsonMaybe(out.text) as { data?: { attaches?: PostAttach[] } };
  return parsed?.data?.attaches ?? [];
}

export function buildAttachmentUrl(baseUrl: string, boardId: number, postId: number, attachId: number | string): string {
  return `${trimBaseUrl(baseUrl)}/api/board/${boardId}/post/${postId}/attaches/${attachId}`;
}

export async function uploadBoardFile(cfg: Config, session: Session, baseUrl: string, filePath: string): Promise<string> {
  const url = new URL(endpoint(baseUrl, cfg.board_image_upload_url, '/api/file'));
  const resolved = toLocalPath(filePath);
  const file = await fs.readFile(resolved);
  const form = new FormData();
  form.set('writeSecret', 'OPEN');
  form.set('file', new Blob([file]), baseName(resolved));

  const { status, text } = await requestText(url.toString(), {
    method: 'POST',
    body: form,
    headers: { Accept: '*/*', 'x-requested-with': 'XMLHttpRequest', timezoneoffset: '540' },
  }, session);
  if (status >= 400) throw new Error(`board file upload http ${status}: ${text.trim()}`);
  return text.trim() ? text : JSON.stringify({ ok: true });
}

/**
 * Replace `src="[{/local/path}]"` placeholders with uploaded media.
 *
 * Images become inline `data-*` tagged sources, other files become post
 * attachments, and mp4 sources are recorded so they can be rewritten to their
 * permanent attachment URL once the post id is known.
 */
async function resolveInlineMedia(
  cfg: Config,
  session: Session,
  baseUrl: string,
  content: string,
): Promise<{ content: string; attaches: InlineAttach[]; videoRewrites: VideoRewrite[] }> {
  const matches = Array.from(content.matchAll(/src=(["'])\[\{([^\]\}]+)\}\]\1/g));
  if (matches.length === 0) return { content, attaches: [], videoRewrites: [] };

  let output = content;
  const attaches: InlineAttach[] = [];
  const videoRewrites: VideoRewrite[] = [];

  for (const match of matches) {
    const [original, quote, rawPath] = match;
    const localPath = toLocalPath(rawPath.trim());
    const fileName = baseName(localPath);
    const parsed = parseJsonMaybe(await uploadBoardFile(cfg, session, baseUrl, localPath)) as { data?: UploadedMedia };
    const data = parsed.data ?? {};
    const ext = (data.fileExt ?? '').toLowerCase();

    if (IMAGE_EXTENSIONS.has(ext)) {
      const src = data.hostId && data.filePath
        ? `/thumb/temp/${data.hostId}/original${data.filePath}`
        : uploadedSrc(data) || rawPath;
      output = output.replace(
        original,
        `data-filename=${quote}${fileName}${quote} data-filepath=${quote}${data.filePath ?? ''}${quote} data-hostid=${quote}${data.hostId ?? ''}${quote} data-inline=${quote}true${quote} src=${quote}${src}${quote}`,
      );
      continue;
    }

    if (data.hostId && data.filePath) {
      attaches.push({ path: data.filePath, name: fileName, hostId: data.hostId });
    }
    const src = uploadedSrc(data) || rawPath;
    if (src && /\.mp4$/i.test(fileName)) videoRewrites.push({ fileName, tempSrc: src });
    output = output.replace(original, `src=${quote}${src}${quote}`);
  }

  return { content: output, attaches, videoRewrites };
}

function rewriteVideoSources(content: string, boardId: number, postId: number, attaches: PostAttach[], rewrites: VideoRewrite[]): string {
  let out = content;
  for (const rewrite of rewrites) {
    const match = attaches.find((a) => (a.name ?? '') === rewrite.fileName && a.id != null);
    if (!match?.id) continue;
    out = out.split(rewrite.tempSrc).join(`/api/board/${boardId}/post/${postId}/attaches/${String(match.id)}`);
  }
  return out;
}

function postPayload(fields: {
  boardId: number;
  postId: number | '';
  subject: string;
  content: string;
  attaches: unknown[];
  writeType: string;
}): Record<string, unknown> {
  return {
    boardId: String(fields.boardId),
    notiMailFlag: false,
    notiPushFlag: false,
    postId: String(fields.postId),
    writeType: fields.writeType,
    publicWriter: false,
    title: fields.subject,
    content: fields.content,
    contentType: 'HTML',
    modifyPCWebPlatform: true,
    attaches: fields.attaches,
    status: 'OPEN',
    authorizedUsers: [],
    stickable: false,
  };
}

/**
 * Some deployments reject the modern payload when inline images are present and
 * only accept the legacy `{subject, content, attaches}` shape.
 */
async function sendPost(
  url: string,
  method: 'POST' | 'PUT',
  session: Session,
  payload: Record<string, unknown>,
  legacy: Record<string, unknown>,
  content: string,
  action: 'create' | 'update',
): Promise<string> {
  let { status, text } = await requestText(url, {
    method,
    body: JSON.stringify(payload),
    headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
  }, session);

  if (status >= 400 && /<img\b/i.test(content) && /attach\.not\.found/i.test(text)) {
    const retry = await requestText(url, {
      method,
      body: JSON.stringify(legacy),
      headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json' },
    }, session);
    status = retry.status;
    text = retry.text;
  }

  if (status >= 400) throw new Error(`board ${action} http ${status}: ${text.trim()}`);
  return text;
}

export async function boardPostCreate(
  cfg: Config,
  session: Session,
  baseUrl: string,
  boardId: number,
  subject: string,
  content: string,
): Promise<string> {
  const url = endpoint(baseUrl, cfg.board_create_url, `/api/board/${boardId}/post`);
  const resolved = await resolveInlineMedia(cfg, session, baseUrl, content);
  const text = await sendPost(
    url,
    'POST',
    session,
    postPayload({ boardId, postId: '', subject, content: resolved.content, attaches: resolved.attaches, writeType: '' }),
    { subject, content: resolved.content, attaches: resolved.attaches },
    resolved.content,
    'create',
  );

  if (resolved.videoRewrites.length > 0) {
    const postId = extractPostId(text);
    if (postId) {
      const attaches = await fetchPostAttaches(baseUrl, session, boardId, postId);
      const rewritten = rewriteVideoSources(resolved.content, boardId, postId, attaches, resolved.videoRewrites);
      if (rewritten !== resolved.content) {
        await boardPostUpdate(cfg, session, baseUrl, boardId, postId, subject, rewritten);
      }
    }
  }

  return text.trim() ? text : JSON.stringify({ ok: true, boardId });
}

export async function boardPostUpdate(
  cfg: Config,
  session: Session,
  baseUrl: string,
  boardId: number,
  postId: number,
  subject: string,
  content: string,
): Promise<string> {
  const url = endpoint(baseUrl, cfg.board_update_url, `/api/board/${boardId}/post/${postId}`);
  const resolved = await resolveInlineMedia(cfg, session, baseUrl, content);
  const existing = await fetchPostAttaches(baseUrl, session, boardId, postId);
  const attaches = existing
    .filter((a) => a.id != null && typeof a.name === 'string')
    .map((a) => ({ id: String(a.id), name: String(a.name) }));

  const text = await sendPost(
    url,
    'PUT',
    session,
    postPayload({ boardId, postId, subject, content: resolved.content, attaches, writeType: 'edit' }),
    { subject, content: resolved.content, attaches },
    resolved.content,
    'update',
  );
  return text.trim() ? text : JSON.stringify({ ok: true, boardId, postId });
}

export async function boardPostAttach(
  cfg: Config,
  session: Session,
  baseUrl: string,
  boardId: number,
  postId: number,
  filePath: string,
): Promise<string> {
  const url = endpoint(baseUrl, cfg.board_attach_url, `/api/board/${boardId}/post/${postId}/attaches`);
  const resolved = toLocalPath(filePath);
  const file = await fs.readFile(resolved);
  const fileName = baseName(resolved);
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
