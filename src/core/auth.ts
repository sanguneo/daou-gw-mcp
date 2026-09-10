import { cookiesFromJar, requestJson, requestText, trimBaseUrl } from './http.js';
import type { Session } from './types.js';

export interface UserSessionInfo {
  id: number;
  name?: string;
}

function ensureBaseUrl(baseUrl?: string): string {
  const root = baseUrl?.trim();
  if (!root) throw new Error('base url required');
  return trimBaseUrl(root);
}

export async function login(baseUrl: string, username: string, password: string): Promise<Session> {
  const root = ensureBaseUrl(baseUrl);
  const first = await requestText(`${root}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  }, { base_url: root, cookies: [] });
  if (first.status >= 400) throw new Error(`login http ${first.status}`);
  if (!first.jar) throw new Error('login cookie jar unavailable');

  const cookies = cookiesFromJar(first.jar);
  const info = await userSession(root, { base_url: root, cookies });
  return {
    user_id: info.id,
    username,
    base_url: root,
    cookies,
    last_check: new Date().toISOString(),
  };
}

/** Cookie carrying the groupware SSO session; every client shares one value. */
export const SSO_COOKIE = 'GOSSOcookie';

/**
 * Build a session from an SSO token issued to another client.
 *
 * The groupware allows a single live session per user, so borrowing the token
 * a browser or the messenger already holds is the only way to work without
 * logging that client out. Throws when the token is not (or no longer) live.
 */
export async function sessionFromToken(baseUrl: string, token: string, username?: string): Promise<Session> {
  const root = ensureBaseUrl(baseUrl);
  const value = token.trim();
  if (!value) throw new Error('sso token required');
  const candidate: Session = {
    username,
    base_url: root,
    cookies: [{ name: SSO_COOKIE, value, path: '/' }],
  };
  const info = await userSession(root, candidate);
  return { ...candidate, user_id: info.id, last_check: new Date().toISOString() };
}

/** SSO token carried by a saved session, when it has one. */
export function tokenFromSession(session: Session): string | undefined {
  return session.cookies?.find((cookie) => cookie.name === SSO_COOKIE)?.value;
}

export async function userSession(baseUrl: string, session: Session): Promise<UserSessionInfo> {
  const { status, data } = await requestJson<{ data?: { id?: number; name?: string } }>(
    `${ensureBaseUrl(baseUrl)}/api/user/session`,
    { method: 'GET' },
    session,
  );
  if (status >= 400) throw new Error(`session http ${status}`);
  if (!data?.data?.id) throw new Error('empty session');
  return { id: data.data.id, name: data.data.name };
}

export async function validateSession(baseUrl: string, session: Session): Promise<boolean> {
  try {
    await userSession(baseUrl, session);
    return true;
  } catch {
    return false;
  }
}
