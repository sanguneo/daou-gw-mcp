import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '../cli.js';
import { saveConfig, saveSession } from './storage.js';

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no addr');
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

async function captureStdout<T>(fn: () => Promise<T>): Promise<{ value: T; output: string }> {
  let output = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    output += String(chunk);
    return true as any;
  });
  try {
    const value = await fn();
    return { value, output };
  } finally {
    spy.mockRestore();
  }
}

describe('mail and approval cli', () => {
  it('runs mail search with non-json output', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/mail/message/list' && req.method === 'POST') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [
            { id: 1, subject: '첫번째 메일', fromToSimple: '보내는사람1', dateUtc: '2026-05-06T00:00:00.000Z', seen: false },
            { id: 2, subject: '두번째 메일', fromToSimple: '보내는사람2', dateUtc: '2026-05-06T01:00:00.000Z', seen: true },
          ],
        }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [] });
      const { value, output } = await captureStdout(() => runCli(['mail', 'search', '--query', 'AWS', '--size', '2']));
      expect(value).toBe(0);
      expect(output).toContain('메일 검색');
      expect(output).toContain('항목 수: 2');
      expect(output).toContain('1. [안읽음]');
      expect(output).toContain('첫번째 메일');
      expect(output).toContain('2. [읽음]');
      expect(output).toContain('두번째 메일');
    } finally {
      await server.close();
    }
  });

  it('runs approval count with non-json output', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/approval/todo/count' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ count: 3 }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });
    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [] });
      const { value, output } = await captureStdout(() => runCli(['approval', 'count']));
      expect(value).toBe(0);
      expect(output).toContain('결재 건수');
      expect(output).toContain('건수: 3');
    } finally {
      await server.close();
    }
  });
});
