import { z } from 'zod';
import { login, sessionFromToken, tokenFromSession, validateSession } from '../core/auth.js';
import { borrowSession, handoffUrl, tokenCandidates } from '../core/borrow.js';
import { mergeConfig } from '../core/config.js';
import { defineOperation } from '../core/registry.js';
import { saveConfig, saveSession } from '../core/storage.js';
import { formatSession } from '../render/config.js';

export const loginOp = defineOperation({
  id: 'login',
  tool: 'login',
  cli: ['login'],
  summary: 'Login and save session cookies',
  input: z.strictObject({
    username: z.string().min(1).describe('Login id'),
    password: z.string().min(1).describe('Login password'),
    base_url: z.string().optional().describe('Groupware base URL; saved for later commands'),
  }),
  run: async (ctx, input) => {
    const cfg = mergeConfig(ctx.cfg, {
      username: input.username,
      password: input.password,
      base_url: input.base_url ?? ctx.cfg.base_url,
    });
    const baseUrl = cfg.base_url?.trim();
    if (!baseUrl) throw new Error('base url required');

    const session = await login(baseUrl, input.username, input.password);
    await saveConfig(cfg);
    await saveSession(session);
    const text = [
      formatSession(session, true),
      '- 주의: 그룹웨어는 사용자당 세션 1개만 유지해서, 이 로그인으로 브라우저/메신저 세션은 로그아웃됐어.',
      '- 브라우저를 다시 살리려면: daou-gw-cli session handoff',
    ].join('\n');
    return { data: session, text };
  },
});

export const sessionOp = defineOperation({
  id: 'session',
  tool: 'session',
  cli: ['session'],
  summary: 'Validate the saved session',
  input: z.strictObject({}),
  run: async (ctx) => {
    const valid = await validateSession(ctx.baseUrl(), ctx.session);
    return { data: { valid, session: ctx.session }, text: formatSession(ctx.session, valid) };
  },
});

export const sessionAdoptOp = defineOperation({
  id: 'session.adopt',
  tool: 'session_adopt',
  cli: ['session', 'adopt'],
  summary: 'Reuse a live session from the browser or messenger instead of logging in',
  input: z.strictObject({
    token: z
      .string()
      .min(1)
      .optional()
      .describe('GOSSOcookie value of a live session; omitted means auto-discover on this machine'),
  }),
  run: async (ctx, input) => {
    const baseUrl = ctx.baseUrl();
    if (input.token) {
      const session = await sessionFromToken(baseUrl, input.token, ctx.cfg.username);
      await saveSession(session);
      return {
        data: { adopted: true, source: 'token', session },
        text: `${formatSession(session, true)}\n- 세션을 빌려 썼어. 다른 클라이언트는 그대로 로그인 상태야.`,
      };
    }

    const borrowed = await borrowSession(baseUrl, ctx.cfg);
    if (!borrowed) {
      const sources = (await tokenCandidates(ctx.cfg)).map((candidate) => candidate.source);
      const detail = sources.length ? `확인한 후보: ${sources.join(', ')}` : '이 PC에서 찾은 후보가 없어';
      throw new Error(
        [
          `빌려올 수 있는 살아있는 세션이 없어 (${detail}).`,
          '브라우저 개발자도구 > Application > Cookies에서 GOSSOcookie 값을 복사해서 --token으로 넘겨줘.',
        ].join('\n'),
      );
    }
    await saveSession(borrowed.session);
    return {
      data: { adopted: true, source: borrowed.source, session: borrowed.session },
      text: `${formatSession(borrowed.session, true)}\n- 출처: ${borrowed.source}\n- 세션을 빌려 썼어. 다른 클라이언트는 그대로 로그인 상태야.`,
    };
  },
});

export const sessionHandoffOp = defineOperation({
  id: 'session.handoff',
  tool: 'session_handoff',
  cli: ['session', 'handoff'],
  summary: 'Print a URL that hands this session back to a browser',
  input: z.strictObject({
    return_url: z.string().optional().describe('Page to land on after the hand-off (default /app/home)'),
  }),
  run: async (ctx, input) => {
    const baseUrl = ctx.baseUrl();
    const token = tokenFromSession(ctx.session);
    if (!token) throw new Error('저장된 세션에 SSO 토큰이 없어. 먼저 session adopt 또는 login을 실행해줘.');
    if (!(await validateSession(baseUrl, ctx.session))) throw new Error('저장된 세션이 이미 만료됐어.');
    const url = handoffUrl(baseUrl, token, input.return_url ?? '/app/home');
    const text = [
      '브라우저에서 아래 주소를 열면 이 세션으로 로그인돼:',
      url,
      '- 토큰은 1회용이라, 브라우저가 열면 CLI 쪽 세션은 만료돼. 그때는 session adopt로 다시 빌려오면 돼.',
    ].join('\n');
    return { data: { url }, text };
  },
});

export const authOperations = [loginOp, sessionOp, sessionAdoptOp, sessionHandoffOp];
