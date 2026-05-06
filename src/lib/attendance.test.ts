import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '../cli.js';
import { loadSession, saveConfig, saveSession } from './storage.js';

const originalHome = process.env.HOME;

function todayKst(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

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

describe('attendance cli', () => {
  it('shows status from mock server', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/calendar/user/7/calendar') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [{ id: 7, name: '회사 일정' }],
        }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [] }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/month') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: {}, clockOutHistory: null }] }] }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [{ name: 'sid', value: 'abc', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'status']));
      expect(value).toBe(0);
      expect(output).toContain('근태 상태');
      expect(output).toContain('출근: 완료');
    } finally {
      await server.close();
    }
  });

  it('shows calendar events', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/calendar/user/7/calendar') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [{ id: 7, name: '회사 일정' }],
        }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [
            { id: 9, calendarId: 7, title: ' - 회의 - ', startTime: '2026-05-06T09:00:00.000+09:00', endTime: '2026-05-06T10:00:00.000+09:00', location: '회의실 A' },
          ],
        }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [{ name: 'sid', value: 'abc', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['calendar', 'list', '--from-date', '2026-05-06', '--to-date', '2026-05-06']));
      expect(value).toBe(0);
      expect(output).toContain('캘린더 일정');
      expect(output).toContain('기간: 2026-05-06 ~ 2026-05-06');
      expect(output).toContain('항목 수: 1');
      expect(output).toContain('회사 일정');
      expect(output).toContain('회의');
      expect(output).toContain('회의실 A');
      expect(output).not.toContain('캘린더 목록');
      expect(output).not.toContain('(id:');
      expect(output).not.toContain('calendar 7');
      expect(output).not.toContain(' - 회의 - ');
    } finally {
      await server.close();
    }
  });

  it('calls clock in endpoint', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    let clockInCalled = false;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [] }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/month') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ weekList: [{ dailyList: [{ detailDay: { day: '2026-04-29' }, clockInHistory: null, clockOutHistory: null }] }] }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/status/clockIn' && req.method === 'POST') {
        clockInCalled = true;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ code: 200 }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [{ name: 'sid', value: 'abc', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'in']));
      expect(value).toBe(0);
      expect(clockInCalled).toBe(true);
      expect(output).toContain('출근 처리 완료');
    } finally {
      await server.close();
    }
  });

  it('re-authenticates when the saved session is invalid', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    let loginCalled = false;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const cookie = req.headers.cookie ?? '';
      if (url.pathname === '/api/login' && req.method === 'POST') {
        loginCalled = true;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Set-Cookie', 'sid=refreshed; Path=/');
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (url.pathname === '/api/user/session') {
        if (cookie.includes('sid=refreshed')) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
          return;
        }
        res.statusCode = 401;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'invalid' }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [] }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/month') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: {}, clockOutHistory: null }] }] }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl, username: 'tester', password: 'secret' });
      await saveSession({ cookies: [{ name: 'sid', value: 'stale', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'status']));
      expect(value).toBe(0);
      expect(loginCalled).toBe(true);
      expect(output).toContain('근태 상태');
      const session = await loadSession();
      expect(session.cookies?.[0]?.value).toBe('refreshed');
    } finally {
      await server.close();
    }
  });

  it('blocks clock in when the calendar has a leave schedule', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    let clockInCalled = false;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/calendar/user/7/calendar') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 7, name: '회사 일정' }] }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [{ id: 99, calendarId: 7, title: '오전반차', startTime: `${todayKst()}T00:00:00.000+09:00`, endTime: `${todayKst()}T23:59:59.999+09:00` }],
        }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/month') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: null, clockOutHistory: null }] }] }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/status/clockIn' && req.method === 'POST') {
        clockInCalled = true;
        res.statusCode = 500;
        res.end('should not be called');
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [{ name: 'sid', value: 'abc', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'in']));
      expect(value).toBe(0);
      expect(clockInCalled).toBe(false);
      expect(output).toContain('건너뜀: 오전반차 일정 있음');
    } finally {
      await server.close();
    }
  });

  it('hides holiday event title from attendance status', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: { id: 7, name: 'tester' } }));
        return;
      }
      if (url.pathname === '/api/calendar/user/7/calendar') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 7, name: '회사 일정' }] }));
        return;
      }
      if (url.pathname === '/api/calendar/event') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          data: [{ id: 100, calendarId: 7, type: 'holiday', timeType: 'allday', title: '석가탄신일', startTime: `${todayKst()}T00:00:00.000+09:00` }],
        }));
        return;
      }
      if (url.pathname === '/api/ehr/timeline/month') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: {}, clockOutHistory: null }] }] }));
        return;
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: 7, cookies: [{ name: 'sid', value: 'abc', path: '/' }] });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'status']));
      expect(value).toBe(0);
      expect(output).toContain('근무구분: 출근');
      expect(output).toContain('공휴일: 아니오');
      expect(output).not.toContain('일정 내용: 석가탄신일');
    } finally {
      await server.close();
    }
  });

});
