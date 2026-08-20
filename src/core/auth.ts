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
