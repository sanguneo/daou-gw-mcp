import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sessionFromToken } from './auth.js';
import type { Config, Session } from './types.js';

/**
 * Borrowing an existing session instead of creating one.
 *
 * The groupware keeps exactly one live session per user: `/api/login` mints a
 * fresh SSO token and invalidates every token handed out before it, no matter
 * which user agent or device headers the request carries. A password login from
 * this tool therefore logs the user out of their browser, messenger and phone.
 *
 * The SSO cookie is portable across clients, so the fix is to reuse the token
 * that is already live somewhere on this machine.
 */
export interface BorrowedSession {
  session: Session;
  source: string;
}

export interface TokenCandidate {
  source: string;
  token: string;
}

const MESSENGER_DIRS = ['aegisepMessenger', 'daouofficeMessenger', 'DaouOfficeMessenger'];

function messengerConfigPaths(cfg: Config): string[] {
  const configured = cfg.messenger_config_path?.trim();
  if (configured) return [configured];
  const roots = [process.env.APPDATA, path.join(os.homedir(), 'AppData', 'Roaming')].filter(
    (root): root is string => Boolean(root),
  );
  const seen = new Set<string>();
  for (const root of roots) {
    for (const dir of MESSENGER_DIRS) seen.add(path.join(root, dir, 'config.json'));
  }
  return [...seen];
}

/** SSO tokens other clients on this machine have stored, newest source first. */
export async function tokenCandidates(cfg: Config): Promise<TokenCandidate[]> {
  const out: TokenCandidate[] = [];
  const envToken = process.env.DAOU_SSO_TOKEN?.trim();
  if (envToken) out.push({ source: 'DAOU_SSO_TOKEN', token: envToken });

  for (const target of messengerConfigPaths(cfg)) {
    const token = await readMessengerToken(target);
    if (token) out.push({ source: `messenger (${target})`, token });
  }
  return out;
}

async function readMessengerToken(target: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await fs.readFile(target, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const token = (JSON.parse(raw) as { token?: unknown }).token;
    return typeof token === 'string' && token.trim() ? token.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Adopt the first live token another client holds.
 * Returns null when nothing usable is available; never logs anyone out.
 */
export async function borrowSession(baseUrl: string, cfg: Config): Promise<BorrowedSession | null> {
  for (const candidate of await tokenCandidates(cfg)) {
    try {
      const session = await sessionFromToken(baseUrl, candidate.token, cfg.username);
      return { session, source: candidate.source };
    } catch {
      /* stale token: try the next source */
    }
  }
  return null;
}

/**
 * URL that hands this session over to a browser.
 * The token is single-use: opening it logs the browser in and invalidates the
 * token this tool holds, so it is only useful as an explicit hand-back.
 */
export function handoffUrl(baseUrl: string, token: string, returnUrl = '/app/home'): string {
  return `${baseUrl}/tokenlogin?token=${encodeURIComponent(token)}&companyId=&returnUrl=${encodeURIComponent(returnUrl)}`;
}
