import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from './cli.js';
import { loadConfig } from './lib/storage.js';

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.unstubAllEnvs();
});

async function withServer(handler: any): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(handler as any);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

describe('cli integration', () => {
  it('shows config and saves config', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;

    const code = await runCli(['config', 'set', '--base-url', 'http://example.com', '--username', 'u', '--attend']);
    expect(code).toBe(0);

    const cfg = await loadConfig();
    expect(cfg.base_url).toBe('http://example.com');
    expect(cfg.attend).toBe(true);

    const out = await runCli(['config', 'show']);
    expect(out).toBe(0);
  });

  it('login and session check work with a mock server', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;

    const server = await withServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/login' && req.method === 'POST') {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', 'sid=abc; Path=/; HttpOnly');
        res.setHeader('Content-Type', 'application/json');
        res.end('{}');
        return;
      }
      if (url.pathname === '/api/user/session' && req.method === 'GET') {
        if ((req.headers.cookie ?? '').includes('sid=abc')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
          return;
        }
        res.statusCode = 401;
        res.end('unauthorized');
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await runCli(['config', 'set', '--base-url', server.baseUrl]);
      const loginCode = await runCli(['login', '--username', 'tester', '--password', 'pw']);
      expect(loginCode).toBe(0);
      const sessionCode = await runCli(['session']);
      expect(sessionCode).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('sends mail with the message send API', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    let sendPayload: any = null;

    const server = await withServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/login' && req.method === 'POST') {
        res.statusCode = 200;
        res.setHeader('Set-Cookie', 'sid=abc; Path=/; HttpOnly');
        res.setHeader('Content-Type', 'application/json');
        res.end('{}');
        return;
      }
      if (url.pathname === '/api/user/session' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/mail/message/send' && req.method === 'POST') {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => { raw += chunk; });
        req.on('end', () => {
          sendPayload = JSON.parse(raw);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ code: 200, ok: true }));
        });
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await runCli(['config', 'set', '--base-url', server.baseUrl, '--mail-sender-email', 'sender@example.com', '--mail-sender-name', 'Tester']);
      await runCli(['login', '--username', 'tester', '--password', 'pw']);
      const code = await runCli(['mail', 'send', '--to', 'receiver@example.com', '--subject', 'Hello', '--content', '<p>body</p>', '--json']);
      expect(code).toBe(0);
      expect(sendPayload).toMatchObject({
        senderEmail: 'sender@example.com',
        senderName: 'Tester',
        to: 'receiver@example.com',
        subject: 'Hello',
        writeMode: 'html',
        content: '<p>body</p>',
        sendType: 'normal',
        reserveMail: false,
        saveSent: true,
      });
    } finally {
      await server.close();
    }
  });
});
