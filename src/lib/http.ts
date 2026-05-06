import { Cookie, CookieJar } from 'tough-cookie';
import type { Session, SavedCookie } from './types.js';

export function jarFromSession(baseUrl: string, session: Session): CookieJar {
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
    if (parsed) jar.setCookieSync(parsed, baseUrl);
  }
  return jar;
}

export function cookiesFromJar(jar: CookieJar): SavedCookie[] {
  const serialized = jar.serializeSync() ?? { cookies: [] };
  const cookies = serialized.cookies ?? [];
  return cookies.map((c) => ({
    name: String(c.key),
    value: String(c.value),
    path: typeof c.path === 'string' ? c.path : undefined,
    expires: typeof c.expires === 'string' && c.expires !== 'Infinity' ? new Date(c.expires).toISOString() : undefined,
    secure: Boolean(c.secure),
    http_only: Boolean(c.httpOnly),
  }));
}

export async function requestText(url: string, init: RequestInit, session?: Session): Promise<{ status: number; text: string; jar?: CookieJar }> {
  const jar = session ? jarFromSession(url, session) : undefined;
  const headers = new Headers(init.headers ?? {});
  headers.set('Accept', 'application/json, text/plain, */*');
  if (jar) {
    const cookie = await jar.getCookieString(url);
    if (cookie) headers.set('Cookie', cookie);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const setCookies = (res.headers as any).getSetCookie?.() as string[] | undefined;
  if (jar && setCookies?.length) {
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
