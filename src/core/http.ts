import { Cookie, CookieJar } from 'tough-cookie';
import type { Session, SavedCookie } from './types.js';

export function jarFromSession(url: string, session: Session): CookieJar {
  const jar = new CookieJar();
  for (const cookie of session.cookies ?? []) {
    const parsed = Cookie.fromJSON({
      key: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires ? new Date(cookie.expires) : undefined,
      secure: cookie.secure,
      httpOnly: cookie.http_only,
    });
    if (parsed) jar.setCookieSync(parsed, url);
  }
  return jar;
}

export function cookiesFromJar(jar: CookieJar): SavedCookie[] {
  const serialized = jar.serializeSync() ?? { cookies: [] };
  return (serialized.cookies ?? []).map((cookie) => ({
    name: String(cookie.key),
    value: String(cookie.value),
    path: typeof cookie.path === 'string' ? cookie.path : undefined,
    expires: typeof cookie.expires === 'string' && cookie.expires !== 'Infinity' ? new Date(cookie.expires).toISOString() : undefined,
    secure: Boolean(cookie.secure),
    http_only: Boolean(cookie.httpOnly),
  }));
}

export interface TextResponse {
  status: number;
  text: string;
  jar?: CookieJar;
}

/** Strip a trailing slash so endpoint joins never double up. */
export function trimBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

/** Resolve an endpoint that may be absolute or relative to the base URL. */
export function joinUrl(baseUrl: string, endpoint: string): string {
  const trimmed = endpoint.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${trimBaseUrl(baseUrl)}/${trimmed.replace(/^\//, '')}`;
}

export async function requestText(url: string, init: RequestInit, session?: Session): Promise<TextResponse> {
  const jar = session ? jarFromSession(url, session) : undefined;
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
  if (jar) {
    const cookie = await jar.getCookieString(url);
    if (cookie) headers.set('Cookie', cookie);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const setCookies = res.headers.getSetCookie?.() ?? [];
  if (jar) {
    for (const raw of setCookies) {
      const parsed = Cookie.parse(raw);
      if (parsed) jar.setCookieSync(parsed, url);
    }
  }
  return { status: res.status, text, jar };
}

export async function requestJson<T>(url: string, init: RequestInit, session?: Session): Promise<{ status: number; data: T; jar?: CookieJar }> {
  const out = await requestText(url, init, session);
  return { status: out.status, data: JSON.parse(out.text) as T, jar: out.jar };
}

/** Parse JSON when possible, otherwise wrap the raw body. */
export function parseJsonMaybe(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true };
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: text };
  }
}
