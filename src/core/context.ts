import { login, validateSession } from './auth.js';
import { borrowSession } from './borrow.js';
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
 *
 * A stale session is first replaced by borrowing the SSO token another client
 * on this machine already holds, because the groupware keeps a single session
 * per user and a password login would log the user's browser out. Logging in
 * is the last resort and stays opt-in (`auto_login`).
 */
export async function requireSession(): Promise<Context> {
  const ctx = await loadContext();
  const baseUrl = ctx.baseUrl();
  if (await validateSession(baseUrl, ctx.session)) return ctx;

  const borrowed = await borrowSession(baseUrl, ctx.cfg);
  if (borrowed) {
    await saveSession(borrowed.session);
    return makeContext(ctx.cfg, borrowed.session);
  }

  const { username, password, auto_login } = ctx.cfg;
  if (!auto_login) {
    throw new Error(
      [
        '세션이 만료됐고 빌려올 수 있는 로그인 세션도 없어.',
        '그룹웨어는 사용자당 세션 1개만 유지하기 때문에 여기서 비밀번호로 로그인하면 브라우저/메신저/휴대폰이 모두 로그아웃돼.',
        '해결 방법 중 하나를 골라줘:',
        '  1) 브라우저에서 로그인한 뒤 GOSSOcookie 값을 넘겨: daou-gw-cli session adopt --token <GOSSOcookie>',
        '  2) 메신저(aegisepMessenger)를 실행해두면 그 세션을 자동으로 빌려 씀',
        '  3) 로그아웃을 감수하고 재로그인 허용: daou-gw-cli config set --auto-login (또는 daou-gw-cli login)',
      ].join('\n'),
    );
  }
  if (!username || !password) throw new Error('session invalid and credentials missing');
  const refreshed = await login(baseUrl, username, password);
  await saveSession(refreshed);
  return makeContext(ctx.cfg, refreshed);
}
