import { login, validateSession } from './auth.js';
import { loadConfig, loadSession, saveSession } from './storage.js';
import { trimBaseUrl } from './http.js';
import type { Config, Session } from './types.js';

/**
 * Everything an operation needs to talk to the groupware.
 * `baseUrl()` throws lazily so config-only operations still work unconfigured.
 */
export interface Context {
  cfg: Config;
  session: Session;
  baseUrl(): string;
}

function makeContext(cfg: Config, session: Session): Context {
  return {
    cfg,
    session,
    baseUrl(): string {
      const raw = cfg.base_url?.trim();
      if (!raw) throw new Error('base url required');
      return trimBaseUrl(raw);
    },
  };
}

/** Load config and session from disk without touching the network. */
export async function loadContext(): Promise<Context> {
  const [cfg, session] = await Promise.all([loadConfig(), loadSession()]);
  return makeContext(cfg, session);
}

/**
 * Load a context with a session known to be valid.
 * A stale session is refreshed once using the saved credentials.
 */
export async function requireSession(): Promise<Context> {
  const ctx = await loadContext();
  const baseUrl = ctx.baseUrl();
  if (await validateSession(baseUrl, ctx.session)) return ctx;

  const { username, password } = ctx.cfg;
  if (!username || !password) throw new Error('session invalid and credentials missing');
  const refreshed = await login(baseUrl, username, password);
  await saveSession(refreshed);
  return makeContext(ctx.cfg, refreshed);
}
