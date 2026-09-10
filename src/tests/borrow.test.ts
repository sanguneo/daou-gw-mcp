import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { requireSession } from '../core/context.js';
import { tokenCandidates } from '../core/borrow.js';
import { loadSession, saveConfig, saveSession } from '../core/storage.js';
import { runCli } from '../surfaces/cli.js';
import { SESSION_USER, captureStdout, json, startServer, useTempHome } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const LIVE_TOKEN = 'live-token';

/**
 * The groupware keeps a single session per user, so `/api/login` must never be
 * reached while another client still holds a live token.
 */
function server(hits: string[]) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    hits.push(`${req.method} ${url.pathname}`);
    if (url.pathname === '/api/user/session') {
      if ((req.headers.cookie ?? '').includes(`GOSSOcookie=${LIVE_TOKEN}`)) {
        json(res, { data: SESSION_USER });
        return;
      }
      json(res, { code: '401', message: 'unauthorized' }, 401);
      return;
    }
    if (url.pathname === '/api/login') {
      res.setHeader('Set-Cookie', `GOSSOcookie=${LIVE_TOKEN}; Path=/`);
      json(res, { code: '200', data: { redirect: '%2Fapp%2Fhome' } });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  };
}

async function writeMessengerStore(dir: string, token: string): Promise<string> {
  const target = path.join(dir, 'messenger.json');
  await fs.writeFile(target, JSON.stringify({ token, loginId: 'u' }), 'utf8');
  return target;
}

describe('session borrowing', () => {
  it('collects tokens from the messenger store and the environment', async () => {
    const home = await useTempHome();
    const target = await writeMessengerStore(home, LIVE_TOKEN);
    vi.stubEnv('DAOU_SSO_TOKEN', 'env-token');

    const candidates = await tokenCandidates({ messenger_config_path: target });
    expect(candidates[0]).toEqual({ source: 'DAOU_SSO_TOKEN', token: 'env-token' });
    expect(candidates[1]?.token).toBe(LIVE_TOKEN);
  });

  it('ignores a messenger store without a token', async () => {
    const home = await useTempHome();
    const target = path.join(home, 'messenger.json');
    await fs.writeFile(target, JSON.stringify({ loginId: 'u' }), 'utf8');
    expect(await tokenCandidates({ messenger_config_path: target })).toEqual([]);
  });

  it('borrows a live token instead of logging in', async () => {
    const home = await useTempHome();
    const hits: string[] = [];
    const mock = await startServer(server(hits));
    try {
      const target = await writeMessengerStore(home, LIVE_TOKEN);
      await saveConfig({ base_url: mock.baseUrl, username: 'u', password: 'p', messenger_config_path: target });
      await saveSession({ base_url: mock.baseUrl, cookies: [{ name: 'GOSSOcookie', value: 'stale', path: '/' }] });

      const ctx = await requireSession();
      expect(ctx.session.user_id).toBe(SESSION_USER.id);
      expect(ctx.session.cookies?.[0]?.value).toBe(LIVE_TOKEN);
      expect(hits).not.toContain('POST /api/login');
    } finally {
      await mock.close();
    }
  });

  it('refuses to log in on its own when no token can be borrowed', async () => {
    await useTempHome();
    const hits: string[] = [];
    const mock = await startServer(server(hits));
    try {
      await saveConfig({ base_url: mock.baseUrl, username: 'u', password: 'p' });
      await saveSession({ base_url: mock.baseUrl, cookies: [{ name: 'GOSSOcookie', value: 'stale', path: '/' }] });

      await expect(requireSession()).rejects.toThrow(/session adopt/);
      expect(hits).not.toContain('POST /api/login');
    } finally {
      await mock.close();
    }
  });

  it('adopts an explicit token from the cli, keeping `session` itself usable', async () => {
    await useTempHome();
    const hits: string[] = [];
    const mock = await startServer(server(hits));
    try {
      await saveConfig({ base_url: mock.baseUrl, username: 'u', password: 'p' });

      const adopted = await captureStdout(() => runCli(['session', 'adopt', '--token', LIVE_TOKEN]));
      expect(adopted.value).toBe(0);
      expect((await loadSession()).cookies?.[0]?.value).toBe(LIVE_TOKEN);
      expect(hits).not.toContain('POST /api/login');

      const status = await captureStdout(() => runCli(['session']));
      expect(status.value).toBe(0);
      expect(status.output).toContain('valid');
    } finally {
      await mock.close();
    }
  });

  it('logs in when auto_login is turned on', async () => {
    await useTempHome();
    const hits: string[] = [];
    const mock = await startServer(server(hits));
    try {
      await saveConfig({ base_url: mock.baseUrl, username: 'u', password: 'p', auto_login: true });
      await saveSession({ base_url: mock.baseUrl, cookies: [{ name: 'GOSSOcookie', value: 'stale', path: '/' }] });

      const ctx = await requireSession();
      expect(ctx.session.user_id).toBe(SESSION_USER.id);
      expect(hits).toContain('POST /api/login');
    } finally {
      await mock.close();
    }
  });
});
