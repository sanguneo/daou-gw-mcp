import type { Config, Session } from './types.js';
import { cookiesFromJar, requestJson, requestText } from './http.js';

function ensureBaseUrl(baseUrl?: string): string {
  const root = baseUrl?.trim();
  if (!root) throw new Error('base url required');
  return root.replace(/\/$/, '');
}

export interface UserSessionInfo {
  id: number;
  name?: string;
}

export async function login(baseUrl: string, username: string, password: string): Promise<Session> {
  const root = ensureBaseUrl(baseUrl);
  const loginUrl = `${root}/api/login`;
  const first = await requestText(loginUrl, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  }, { base_url: root, cookies: [] });
  if (first.status >= 400) {
    throw new Error(`login http ${first.status}`);
  }
  if (!first.jar) {
    throw new Error('login cookie jar unavailable');
  }
  const sessionInfo = await userSession(root, { base_url: root, cookies: cookiesFromJar(first.jar) });
  return {
    user_id: sessionInfo.id,
    username,
    base_url: root,
    cookies: cookiesFromJar(first.jar),
    last_check: new Date().toISOString(),
  };
}

export async function userSession(baseUrl: string, session: Session): Promise<UserSessionInfo> {
  const url = `${ensureBaseUrl(baseUrl)}/api/user/session`;
  const { status, data } = await requestJson<{ data: { id: number; name?: string } }>(url, { method: 'GET' }, session);
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

export function mergeConfig(cfg: Config, patch: Partial<Config>): Config {
  return {
    ...cfg,
    ...patch,
    base_url: patch.base_url?.trim() || cfg.base_url?.trim(),
  };
}
