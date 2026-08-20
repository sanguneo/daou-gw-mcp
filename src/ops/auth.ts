import { z } from 'zod';
import { login, validateSession } from '../core/auth.js';
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
    return { data: session, text: formatSession(session, true) };
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

export const authOperations = [loginOp, sessionOp];
