import type { Config, Session } from './types.js';
import { loadConfig, loadSession, saveSession } from './storage.js';
import { login, validateSession } from './auth.js';

export function resolveBaseUrl(cfg: Config, _session?: Session): string {
  const baseUrl = cfg.base_url?.trim();
  if (!baseUrl) throw new Error('base url required');
  return baseUrl.replace(/\/$/, '');
}

export interface ResolvedSession {
  cfg: Config;
  session: Session;
  refreshed: boolean;
}

export async function resolveSession(): Promise<ResolvedSession> {
  const cfg = await loadConfig();
  const session = await loadSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  if (await validateSession(baseUrl, session)) {
    return { cfg, session, refreshed: false };
  }
  if (!cfg.username || !cfg.password) {
    throw new Error('session invalid and credentials missing');
  }
  const refreshed = await login(baseUrl, cfg.username, cfg.password);
  await saveSession(refreshed);
  return { cfg, session: refreshed, refreshed: true };
}
