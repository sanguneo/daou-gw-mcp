import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadConfig, loadSession, saveConfig, saveSession } from '../core/storage.js';
import { todayKst } from '../core/time.js';
import { runCli } from '../surfaces/cli.js';
import { SESSION_USER, captureStdout, json, readBody, startServer, useTempHome } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const COOKIE = [{ name: 'sid', value: 'abc', path: '/' }];

function routes(handlers: Record<string, (req: IncomingMessage, res: ServerResponse) => void>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const handler = handlers[url.pathname];
    if (handler) {
      handler(req, res);
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  };
}

const sessionRoute = (_req: IncomingMessage, res: ServerResponse) => json(res, { data: SESSION_USER });

describe('cli surface', () => {
  it('lists commands and hides attendance by default', async () => {
    await useTempHome();
    const { value, output } = await captureStdout(() => runCli([]));
    expect(value).toBe(0);
    expect(output).toContain('mail');
    expect(output).toContain('board');
    expect(output).not.toContain('attend');
  });

  it('shows attendance commands when the switch is on', async () => {
    await useTempHome();
    await saveConfig({ attend: true });
    const { output } = await captureStdout(() => runCli([]));
    expect(output).toContain('attend');
  });

  it('saves and shows config', async () => {
    await useTempHome();
    const code = await captureStdout(() => runCli(['config', 'set', '--base-url', 'http://example.com', '--username', 'u', '--attend']));
    expect(code.value).toBe(0);

    const cfg = await loadConfig();
    expect(cfg.base_url).toBe('http://example.com');
    expect(cfg.username).toBe('u');
    expect(cfg.attend).toBe(true);

    const shown = await captureStdout(() => runCli(['config', 'show']));
    expect(shown.value).toBe(0);
    expect(shown.output).toContain('Base URL: http://example.com');
  });

  it('reads --attend false as turning the switch off', async () => {
    await useTempHome();
    await saveConfig({ attend: true });
    await captureStdout(() => runCli(['config', 'set', '--attend', 'false']));
    expect((await loadConfig()).attend).toBe(false);
  });

  it('rejects an unknown flag', async () => {
    await useTempHome();
    const { value } = await captureStdout(() => runCli(['config', 'set', '--nope', 'x']));
    expect(value).toBe(1);
  });

  it('logs in and validates the session', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/login': (_req, res) => {
        res.setHeader('Set-Cookie', 'sid=abc; Path=/; HttpOnly');
        json(res, {});
      },
      '/api/user/session': (req, res) => {
        if ((req.headers.cookie ?? '').includes('sid=abc')) return json(res, { data: SESSION_USER });
        return json(res, { message: 'unauthorized' }, 401);
      },
    }));

    try {
      await captureStdout(() => runCli(['config', 'set', '--base-url', server.baseUrl]));
      const login = await captureStdout(() => runCli(['login', '--username', 'tester', '--password', 'pw']));
      expect(login.value).toBe(0);
      expect((await loadSession()).user_id).toBe(SESSION_USER.id);

      const session = await captureStdout(() => runCli(['session']));
      expect(session.value).toBe(0);
      expect(session.output).toContain('상태: valid');
    } finally {
      await server.close();
    }
  });

  it('searches mail and renders the entries', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/mail/message/list': (_req, res) => json(res, {
        data: [
          { id: 1, subject: '첫번째 메일', fromToSimple: '보내는사람1', dateUtc: '2026-05-06T00:00:00.000Z', seen: false },
          { id: 2, subject: '두번째 메일', fromToSimple: '보내는사람2', dateUtc: '2026-05-06T01:00:00.000Z', seen: true },
        ],
      }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['mail', 'search', '--query', 'AWS', '--size', '2']));
      expect(value).toBe(0);
      expect(output).toContain('메일 검색');
      expect(output).toContain('항목 수: 2');
      expect(output).toContain('1. [안읽음]');
      expect(output).toContain('첫번째 메일');
      expect(output).toContain('2. [읽음]');
    } finally {
      await server.close();
    }
  });

  it('sends mail with the resolved sender and html body', async () => {
    await useTempHome();
    let payload: any = null;
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/mail/message/send': async (req, res) => {
        payload = JSON.parse(await readBody(req));
        json(res, { code: 200, ok: true });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl, mail_sender_email: 'sender@example.com', mail_sender_name: 'Tester' });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value } = await captureStdout(() => runCli([
        'mail', 'send',
        '--to', 'receiver@example.com',
        '--subject', 'Hello',
        '--content', '<p>body</p>',
      ]));

      expect(value).toBe(0);
      expect(payload).toMatchObject({
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

  it('collects repeated --id flags when deleting mail', async () => {
    await useTempHome();
    let payload: any = null;
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/mail/message/delete': async (req, res) => {
        payload = JSON.parse(await readBody(req));
        json(res, { ok: true });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value } = await captureStdout(() => runCli(['mail', 'delete', '--id', 'a', '--id', 'b', '--id', 'a']));
      expect(value).toBe(0);
      expect(payload.uids).toEqual(['a', 'b']);
    } finally {
      await server.close();
    }
  });

  it('counts approvals', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/approval/todo/count': (_req, res) => json(res, { count: 3 }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['approval', 'count']));
      expect(value).toBe(0);
      expect(output).toContain('결재 건수');
      expect(output).toContain('건수: 3');
    } finally {
      await server.close();
    }
  });

  it('prints raw json when --json is passed', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/approval/todo/count': (_req, res) => json(res, { count: 3 }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['approval', 'count', '--json']));
      expect(value).toBe(0);
      expect(JSON.parse(output)).toEqual({ count: 3 });
    } finally {
      await server.close();
    }
  });

  it('lists calendar events with clean labels', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '회사 일정' }] }),
      '/api/calendar/event': (_req, res) => json(res, {
        data: [{
          id: 9,
          calendarId: 7,
          title: ' - 회의 - ',
          startTime: '2026-05-06T09:00:00.000+09:00',
          endTime: '2026-05-06T10:00:00.000+09:00',
          location: '회의실 A',
        }],
      }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli([
        'calendar', 'list', '--from-date', '2026-05-06', '--to-date', '2026-05-06',
      ]));

      expect(value).toBe(0);
      expect(output).toContain('캘린더 일정');
      expect(output).toContain('기간: 2026-05-06 ~ 2026-05-06');
      expect(output).toContain('항목 수: 1');
      expect(output).toContain('회의실 A');
      expect(output).toContain('회사 일정');
      expect(output).not.toContain(' - 회의 - ');
    } finally {
      await server.close();
    }
  });

  it('attaches a local file to a board post', async () => {
    const home = await useTempHome();
    const filePath = path.join(home, 'note.txt');
    await fs.writeFile(filePath, 'hello attachment');

    let uploaded = '';
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/board/1/post/2/attaches': async (req, res) => {
        uploaded = await readBody(req);
        json(res, { attachId: 5 });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli([
        'board', 'attach', '--board-id', '1', '--post-id', '2', '--file', filePath,
      ]));

      expect(value).toBe(0);
      expect(output).toContain('attach ok: 5');
      expect(uploaded).toContain('hello attachment');
      expect(uploaded).toContain('note.txt');
    } finally {
      await server.close();
    }
  });

  it('re-authenticates when the saved session is stale', async () => {
    await useTempHome();
    let loginCalled = false;
    const server = await startServer(routes({
      '/api/login': (_req, res) => {
        loginCalled = true;
        res.setHeader('Set-Cookie', 'sid=refreshed; Path=/');
        json(res, { ok: true });
      },
      '/api/user/session': (req, res) => {
        if ((req.headers.cookie ?? '').includes('sid=refreshed')) return json(res, { data: SESSION_USER });
        return json(res, { message: 'invalid' }, 401);
      },
      '/api/approval/todo/count': (_req, res) => json(res, { count: 1 }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl, username: 'tester', password: 'secret' });
      await saveSession({ cookies: [{ name: 'sid', value: 'stale', path: '/' }] });

      const { value } = await captureStdout(() => runCli(['approval', 'count']));
      expect(value).toBe(0);
      expect(loginCalled).toBe(true);
      expect((await loadSession()).cookies?.[0]?.value).toBe('refreshed');
    } finally {
      await server.close();
    }
  });
});

describe('organization cli', () => {
  const DIRECTORY = [
    { id: 1, name: '나상권', email: 'sknah@aegisep.com', position: '과장', departments: [{ name: '개발3파트' }], mobileNo: '010-1111-2222', manager: false },
    { id: 2, name: '김철수', email: 'kim@aegisep.com', position: '대리', departments: [{ name: '영업팀' }], manager: false },
  ];

  function directoryServer(onHit: () => void) {
    return routes({
      '/api/user/session': sessionRoute,
      '/api/user/search': (_req, res) => {
        onHit();
        json(res, { page: { page: 0, totalPage: 1, total: DIRECTORY.length }, hasNext: false, data: DIRECTORY });
      },
    });
  }

  it('searches the directory and caches it locally', async () => {
    const home = await useTempHome();
    let hits = 0;
    const server = await startServer(directoryServer(() => { hits += 1; }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });

      const first = await captureStdout(() => runCli(['org', 'search', '--query', '개발3파트']));
      expect(first.value).toBe(0);
      expect(first.output).toContain('나상권');
      expect(first.output).not.toContain('김철수');
      expect(hits).toBe(1);

      const cache = JSON.parse(await fs.readFile(path.join(home, '.daou', 'directory.json'), 'utf8')) as { entries: unknown[] };
      expect(cache.entries).toHaveLength(2);
    } finally {
      await server.close();
    }

    // The server is gone; a second search must be served from the cache.
    const cached = await captureStdout(() => runCli(['org', 'search', '--query', '김']));
    expect(cached.value).toBe(0);
    expect(cached.output).toContain('김철수');
    expect(cached.output).not.toContain('나상권');
  });

  it('re-fetches the directory when --refresh is passed', async () => {
    await useTempHome();
    let hits = 0;
    const server = await startServer(directoryServer(() => { hits += 1; }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      await captureStdout(() => runCli(['org', 'search']));
      await captureStdout(() => runCli(['org', 'search', '--refresh']));
      expect(hits).toBe(2);
    } finally {
      await server.close();
    }
  });

  const ORG_TREE = [{
    data: { id: 'company_10', title: '이지스엔터프라이즈', attr: { id: 'company_10', title: '이지스엔터프라이즈', rel: 'company', nodeId: 10 } },
    children: [{
      data: { id: 'org_159', title: '개발3파트', attr: { id: 'org_159', title: '개발3파트', rel: 'org', nodeId: 159 } },
      children: [{
        data: { id: 'USER_848', title: '나상권 과장', attr: { id: 'USER_848', title: '나상권 과장', rel: 'USER', nodeId: 848 } },
        metadata: { id: 7, name: '나상권' },
        children: [],
      }],
    }],
  }];

  it('renders the organization tree without members by default', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/organization/list': (_req, res) => json(res, ORG_TREE),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['org', 'tree']));
      expect(value).toBe(0);
      expect(output).toContain('조직도');
      expect(output).toContain('+ 이지스엔터프라이즈 (#10)');
      expect(output).toContain('  + 개발3파트 (#159)');
      expect(output).not.toContain('나상권');
    } finally {
      await server.close();
    }
  });

  it('includes people when --members is passed', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/organization/list': (_req, res) => json(res, ORG_TREE),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { output } = await captureStdout(() => runCli(['org', 'tree', '--members']));
      expect(output).toContain('    - 나상권 과장');
    } finally {
      await server.close();
    }
  });
});

describe('approval form and draft cli', () => {
  const folderNode = (nodeId: number, title: string) => ({
    data: { id: `FOLDER_${nodeId}`, title, attr: { id: `FOLDER_${nodeId}`, title, rel: 'FOLDER', nodeId } },
    attr: { id: `FOLDER_${nodeId}`, title, rel: 'FOLDER', nodeId },
  });
  const formNode = (nodeId: number, title: string) => ({
    data: { id: `FORM_${nodeId}`, title, attr: { id: `FORM_${nodeId}`, title, rel: 'FORM', nodeId } },
    attr: { id: `FORM_${nodeId}`, title, rel: 'FORM', nodeId },
  });

  function formServer(extra: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {}) {
    return routes({
      '/api/user/session': sessionRoute,
      '/api/approval/apprform/tree': (req, res) => {
        const folder = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('folderId');
        if (folder === '12') return json(res, [formNode(5374, '연차신청-연차관리연동'), formNode(4791, '지각확인서')]);
        if (folder === '11') return json(res, [formNode(3001, '경조사비 신청서')]);
        return json(res, [folderNode(11, '복지'), folderNode(12, '근태')]);
      },
      ...extra,
    });
  }

  it('searches forms across folders and reports the form id', async () => {
    await useTempHome();
    const server = await startServer(formServer());

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['approval', 'form-search', '--query', '연차']));

      expect(value).toBe(0);
      expect(output).toContain('전체: 3개 / 결과: 1개');
      expect(output).toContain('근태 > 연차신청-연차관리연동 (form 5374)');
      expect(output).not.toContain('지각확인서');
    } finally {
      await server.close();
    }
  });

  it('lists the whole form catalogue as a tree', async () => {
    await useTempHome();
    const server = await startServer(formServer());

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['approval', 'forms']));
      expect(value).toBe(0);
      expect(output).toContain('+ 복지');
      expect(output).toContain('  - 경조사비 신청서 (form 3001)');
      expect(output).toContain('+ 근태');
      expect(output).toContain('  - 연차신청-연차관리연동 (form 5374)');
    } finally {
      await server.close();
    }
  });

  it('saves a draft without ever submitting it', async () => {
    await useTempHome();
    let tempsaveBody: any = null;
    let tempsaveMethod = '';
    const forbidden: string[] = [];

    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/organization/list': (_req, res) => json(res, [{
        data: { id: 'company_10', title: '회사', attr: { id: 'company_10', title: '회사', rel: 'company', nodeId: 10 } },
        children: [{
          data: { id: 'org_159', title: '개발3파트', attr: { id: 'org_159', title: '개발3파트', rel: 'org', nodeId: 159 } },
          children: [{
            data: { id: 'USER_848', title: '나상권', attr: { id: 'USER_848', title: '나상권', rel: 'USER', nodeId: 848 } },
            metadata: { id: 7, name: '나상권' },
            children: [],
          }],
        }],
      }]),
      '/api/approval/document/new': (_req, res) => json(res, {
        data: {
          id: 93191,
          document: {
            id: 93191, documentId: 93191, formName: '연차신청-연차관리연동',
            docBodyContent: '<p>template</p>', variables: { restPoint: '7.0' },
            attachCount: 0, attaches: [], comments: [], references: [], reDraft: false,
            updatedAt: '2026-08-20T10:00:00.000+09:00',
          },
          // The real endpoint returns fully expanded folder objects and numeric scalars.
          docInfo: {
            id: 93191,
            formId: 5374,
            securityLevelId: 22,
            docYear: 5,
            isPublic: false,
            isEmergency: false,
            docFolders: [{ id: 12, name: '근태', state: 'HIDDEN' }],
            defaultFolder: { id: 12, name: '근태' },
            docReferenceReaders: [{ id: 168079, readerType: '참조문서' }],
            officialVersions: [{ state: 'CREATE' }],
            drafterDeptId: 159,
          },
          apprFlow: { id: 93191, currentActivityId: 264371 },
        },
      }),
      '/api/approval/document/93191/tempsave': async (req, res) => {
        tempsaveMethod = req.method ?? '';
        tempsaveBody = JSON.parse(await readBody(req));
        json(res, { data: { document: { id: 93191, title: '8월 연차', formName: '연차신청-연차관리연동', docStatus: 'TEMPSAVE', docStatusName: '임시저장' } } });
      },
      '/api/approval/document/93191/submit': (_req, res) => { forbidden.push('submit'); json(res, {}); },
      '/api/approval/document/93191/approval': (_req, res) => { forbidden.push('approval'); json(res, {}); },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli([
        'approval', 'draft', '--form-id', '5374', '--title', '8월 연차', '--content', '<p>사유</p>',
      ]));

      expect(value).toBe(0);
      expect(tempsaveMethod).toBe('PUT');
      expect(forbidden).toEqual([]);

      // The department is resolved from the org chart, not guessed.
      expect(output).toContain('기안부서: 159');
      expect(output).toContain('임시저장 완료');
      expect(output).toContain('상신은 하지 않았습니다');

      // Overrides land on the document, and untouched form data survives.
      expect(tempsaveBody.document.title).toBe('8월 연차');
      expect(tempsaveBody.document.docBodyContent).toBe('<p>사유</p>');
      expect(tempsaveBody.document.variables.restPoint).toBe('7.0');
      expect(tempsaveBody.apprFlow.currentActivityId).toBe(264371);

      // docInfo must be collapsed the way the web client sends it, otherwise the
      // document saves but never appears in the 임시문서함.
      expect(tempsaveBody.docInfo).toEqual({
        id: 93191,
        securityLevelId: '22',
        docYear: '5',
        docFolders: [{ id: '12' }],
        docReceptionReaders: [],
        docReferenceReaders: [{ id: 168079, readerType: '참조문서' }],
        docReadingReaders: [],
        officialVersions: [{ state: 'CREATE' }],
        isPublic: 'false',
        isEmergency: false,
        drafterDeptFolderId: '',
      });
    } finally {
      await server.close();
    }
  });

  it('opens each document box on its own endpoint', async () => {
    await useTempHome();
    const seen: string[] = [];
    const boxResponse = (_req: IncomingMessage, res: ServerResponse) => json(res, {
      page: { total: 82 },
      data: [{
        id: 92777, documentId: 92777, title: '연차신청', formName: '연차신청',
        docStatusName: '완료', drafterName: '나상권', draftedAt: '2026-08-06T13:19:08.079+09:00',
      }],
    });

    const server = await startServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/api/user/session') return sessionRoute(req, res);
      if (url.pathname.startsWith('/api/approval/doclist/')) {
        seen.push(`${url.pathname}?property=${url.searchParams.get('property')}&duration=${url.searchParams.get('duration')}`);
        return boxResponse(req, res);
      }
      res.statusCode = 404;
      res.end('not found');
    });

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });

      const drafted = await captureStdout(() => runCli(['approval', 'box']));
      expect(drafted.value).toBe(0);
      expect(drafted.output).toContain('기안문서');
      expect(drafted.output).toContain('- 전체: 82건 / 표시: 1건');
      expect(drafted.output).toContain('[완료]');
      expect(drafted.output).toContain('나상권');

      const temp = await captureStdout(() => runCli(['approval', 'box', '--kind', 'tempsave']));
      expect(temp.output).toContain('임시문서');

      for (const kind of ['approve', 'viewer', 'reception', 'send', 'official']) {
        await captureStdout(() => runCli(['approval', 'box', '--kind', kind]));
      }

      expect(seen).toEqual([
        '/api/approval/doclist/draft/all?property=draftedAt&duration=all',
        '/api/approval/doclist/tempsave/all?property=updatedAt&duration=null',
        '/api/approval/doclist/approve/all?property=draftedAt&duration=all',
        '/api/approval/doclist/viewer/all?property=document.draftedAt&duration=all',
        '/api/approval/doclist/reception/waiting?property=receivedAt&duration=null',
        '/api/approval/doclist/send/all?property=createdAt&duration=all',
        '/api/approval/doclist/userofficial/all?property=document.completedAt&duration=all',
      ]);
    } finally {
      await server.close();
    }
  });

  it('keeps the form template when no content override is given', async () => {
    await useTempHome();
    let tempsaveBody: any = null;
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/approval/document/new': (_req, res) => json(res, {
        data: {
          id: 500,
          document: { id: 500, documentId: 500, formName: '지각확인서', docBodyContent: '<p>template</p>', variables: {} },
          docInfo: {}, apprFlow: {},
        },
      }),
      '/api/approval/document/500/tempsave': async (req, res) => {
        tempsaveBody = JSON.parse(await readBody(req));
        json(res, { data: { document: { id: 500, title: '지각확인서', docStatusName: '임시저장' } } });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value } = await captureStdout(() => runCli(['approval', 'draft', '--form-id', '4791', '--dept-id', '159']));
      expect(value).toBe(0);
      expect(tempsaveBody.document.docBodyContent).toBe('<p>template</p>');
      expect(tempsaveBody.document.title).toBe('지각확인서');
    } finally {
      await server.close();
    }
  });
});

describe('calendar summary cli', () => {
  it('summarises a single day and groups by date', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '회사 일정' }] }),
      '/api/calendar/event': (_req, res) => json(res, {
        data: [
          { id: 1, calendarId: 7, title: '주간회의', startTime: '2026-05-06T09:00:00.000+09:00', endTime: '2026-05-06T10:00:00.000+09:00' },
          { id: 2, calendarId: 7, title: '워크샵', timeType: 'allday', startTime: '2026-05-06T00:00:00.000+09:00' },
        ],
      }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['calendar', 'summary', '--range', 'day', '--date', '2026-05-06']));

      expect(value).toBe(0);
      expect(output).toContain('캘린더 요약 · 지정일');
      expect(output).toContain('기간: 2026-05-06 ~ 2026-05-06');
      expect(output).toContain('총 2건 (종일 1 / 시간지정 1)');
      expect(output).toContain('회사 일정 2');
      expect(output).toContain('2026-05-06');
      expect(output).toContain('주간회의');
    } finally {
      await server.close();
    }
  });

  it('drops events the calendar returns from outside the window', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '휴일일정' }] }),
      '/api/calendar/event': (_req, res) => json(res, {
        data: [
          { id: 1, calendarId: 7, title: '광복절', timeType: 'allday', startTime: '2026-08-17T00:00:00.000+09:00' },
          { id: 2, calendarId: 7, title: '추석', timeType: 'allday', startTime: '2026-09-24T00:00:00.000+09:00' },
          { id: 3, calendarId: 7, title: '개천절', timeType: 'allday', startTime: '2026-10-03T00:00:00.000+09:00' },
        ],
      }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['calendar', 'summary', '--range', 'week', '--date', '2026-08-19']));

      expect(value).toBe(0);
      expect(output).toContain('기간: 2026-08-17 ~ 2026-08-23');
      expect(output).toContain('총 1건');
      expect(output).toContain('광복절');
      expect(output).not.toContain('추석');
      expect(output).not.toContain('개천절');
    } finally {
      await server.close();
    }
  });

  it('expands a week range around the anchor date', async () => {
    await useTempHome();
    let requested = '';
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '회사 일정' }] }),
      '/api/calendar/event': (req, res) => {
        requested = req.url ?? '';
        json(res, { data: [] });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      // 2026-05-06 is a Wednesday, so the week runs Monday 05-04 to Sunday 05-10.
      const { value, output } = await captureStdout(() => runCli(['calendar', 'summary', '--range', 'week', '--date', '2026-05-06']));

      expect(value).toBe(0);
      expect(output).toContain('기간: 2026-05-04 ~ 2026-05-10');
      expect(output).toContain('일정이 없습니다.');
      expect(decodeURIComponent(requested)).toContain('2026-05-04T00:00:00.000+09:00');
      expect(decodeURIComponent(requested)).toContain('2026-05-10T23:59:59.999+09:00');
    } finally {
      await server.close();
    }
  });
});

describe('attendance cli', () => {
  const attendanceRoutes = (extra: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {}, events: unknown[] = []) => routes({
    '/api/user/session': sessionRoute,
    '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '회사 일정' }] }),
    '/api/calendar/event': (_req, res) => json(res, { data: events }),
    '/api/ehr/timeline/month': (_req, res) => json(res, {
      weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: {}, clockOutHistory: null }] }],
    }),
    ...extra,
  });

  it('shows the current state', async () => {
    await useTempHome();
    const server = await startServer(attendanceRoutes());

    try {
      await saveConfig({ base_url: server.baseUrl });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['--attend', 'attend', 'status']));
      expect(value).toBe(0);
      expect(output).toContain('근태 상태');
      expect(output).toContain('출근: 완료');
      expect(output).toContain('퇴근: 미처리');
    } finally {
      await server.close();
    }
  });

  it('refuses attendance commands while the switch is off', async () => {
    await useTempHome();
    const { value } = await captureStdout(() => runCli(['attend', 'status']));
    expect(value).toBe(1);
  });

  it('clocks in when nothing blocks it', async () => {
    await useTempHome();
    let clockedIn = false;
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/calendar/user/7/calendar': (_req, res) => json(res, { data: [{ id: 7, name: '회사 일정' }] }),
      '/api/calendar/event': (_req, res) => json(res, { data: [] }),
      '/api/ehr/timeline/month': (_req, res) => json(res, {
        weekList: [{ dailyList: [{ detailDay: { day: todayKst() }, clockInHistory: null, clockOutHistory: null }] }],
      }),
      '/api/ehr/timeline/status/clockIn': (_req, res) => {
        clockedIn = true;
        json(res, { code: 200 });
      },
    }));

    try {
      await saveConfig({ base_url: server.baseUrl, attend: true });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['attend', 'in']));

      // A weekend or public holiday legitimately blocks the call.
      if (output.includes('건너뜀')) {
        expect(clockedIn).toBe(false);
      } else {
        expect(value).toBe(0);
        expect(clockedIn).toBe(true);
        expect(output).toContain('출근 처리 완료');
      }
    } finally {
      await server.close();
    }
  });

  it('skips clocking in when the calendar shows leave', async () => {
    await useTempHome();
    let clockedIn = false;
    const server = await startServer(attendanceRoutes(
      {
        '/api/ehr/timeline/status/clockIn': (_req, res) => {
          clockedIn = true;
          json(res, {}, 500);
        },
      },
      [{ id: 99, calendarId: 7, title: '오전반차', startTime: `${todayKst()}T00:00:00.000+09:00` }],
    ));

    try {
      await saveConfig({ base_url: server.baseUrl, attend: true });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['attend', 'in']));
      expect(value).toBe(0);
      expect(clockedIn).toBe(false);
      expect(output).toContain('건너뜀: 오전반차 일정 있음');
    } finally {
      await server.close();
    }
  });

  it('shows the monthly attendance sheet', async () => {
    await useTempHome();
    const server = await startServer(routes({
      '/api/user/session': sessionRoute,
      '/api/ehr/timeline/month': (_req, res) => json(res, {
        yyyymm: '202605',
        user: { name: '나상권' },
        workingTime: { normalStr: '160h 0m 0s', extensionStr: '4h 0m 0s', nightStr: '0h 0m 0s', totalStr: '164h 0m 0s' },
        weekList: [{
          dailyList: [
            {
              detailDay: { day: '2026-05-04', dayOfWeekStr: '월', afterNow: false },
              clockInTime: '08:55', clockOutTime: '18:05',
              workingTime: { totalStr: '8h 0m 0s' },
              holiDay: false, workingDay: true, tardy: false, early: false, absence: false,
            },
            {
              detailDay: { day: '2026-05-05', dayOfWeekStr: '화', afterNow: false },
              holiDay: true, workingDay: false, tardy: false, early: false, absence: false,
            },
            {
              detailDay: { day: '2026-05-06', dayOfWeekStr: '수', afterNow: false },
              clockInTime: '09:20', clockOutTime: '18:00',
              workingTime: { totalStr: '7h 40m 0s' },
              holiDay: false, workingDay: true, tardy: true, early: false, absence: false,
            },
            {
              detailDay: { day: '2026-05-29', dayOfWeekStr: '금', afterNow: true },
              holiDay: false, workingDay: true, tardy: false, early: false, absence: true,
            },
          ],
        }],
      }),
    }));

    try {
      await saveConfig({ base_url: server.baseUrl, attend: true });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { value, output } = await captureStdout(() => runCli(['attend', 'history', '--month', '2026-05']));

      expect(value).toBe(0);
      expect(output).toContain('근태 현황 202605');
      expect(output).toContain('대상: 나상권');
      expect(output).toContain('근무일수: 2일');
      expect(output).toContain('지각 1');
      // The future day is flagged absent by the API but must not be counted.
      expect(output).toContain('결근 0');
      expect(output).toContain('합계: 164h 0m 0s');
      expect(output).toContain('2026-05-04(월) 08:55 ~ 18:05 | 8h 0m 0s');
      expect(output).toContain('2026-05-05(화) --:-- ~ --:-- [휴일]');
      expect(output).toContain('2026-05-06(수) 09:20 ~ 18:00 | 7h 40m 0s [지각]');
      // Days in the future are not printed as missing attendance.
      expect(output).not.toContain('2026-05-29');
    } finally {
      await server.close();
    }
  });

  it('hides the attendance sheet while the switch is off', async () => {
    await useTempHome();
    const { value } = await captureStdout(() => runCli(['attend', 'history']));
    expect(value).toBe(1);
  });

  it('does not treat a holiday calendar entry as leave', async () => {
    await useTempHome();
    const server = await startServer(attendanceRoutes(
      {},
      [{ id: 100, calendarId: 7, type: 'holiday', timeType: 'allday', title: '석가탄신일', startTime: `${todayKst()}T00:00:00.000+09:00` }],
    ));

    try {
      await saveConfig({ base_url: server.baseUrl, attend: true });
      await saveSession({ user_id: SESSION_USER.id, cookies: COOKIE });
      const { output } = await captureStdout(() => runCli(['attend', 'status']));
      expect(output).not.toContain('일정 내용: 석가탄신일');
      expect(output).not.toContain('근무구분: 연차');
    } finally {
      await server.close();
    }
  });
});
