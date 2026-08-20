import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { saveConfig } from '../core/storage.js';
import { callTool, listTools } from '../surfaces/mcp.js';
import { useTempHome } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

async function toolNames(): Promise<string[]> {
  return (await listTools()).map((tool) => tool.name);
}

describe('mcp tool visibility', () => {
  it('exposes attendance history but never clock actions', async () => {
    const tmp = await useTempHome();

    expect(await toolNames()).toEqual(expect.not.arrayContaining(['attend_status', 'attend_in', 'attend_out']));
    await fs.mkdir(path.join(tmp, '.daou'), { recursive: true });
    await fs.writeFile(path.join(tmp, '.daou', 'config.json'), JSON.stringify({
      base_url: 'http://example.com',
      attend: true,
    }));
    expect(await toolNames()).toEqual(expect.arrayContaining(['attend_history']));
    expect(await toolNames()).toEqual(expect.not.arrayContaining(['attend_status', 'attend_in', 'attend_out']));
  });

  it('always exposes the core tools', async () => {
    await useTempHome();
    expect(await toolNames()).toEqual(expect.arrayContaining([
      'config_show',
      'config_set',
      'login',
      'session',
      'mail_list',
      'mail_search',
      'mail_delete',
      'mail_send',
      'calendar_list',
      'approval_todo',
      'approval_reference',
      'approval_count',
      'approval_leave_count',
      'board_post_create',
      'board_post_update',
    ]));
  });

  it('refuses a hidden tool as unknown', async () => {
    await useTempHome();
    const result = await callTool('attend_status', {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('unknown tool');
  });

  it('refuses legacy clock action aliases', async () => {
    await useTempHome();
    const result = await callTool('attendance_status', {});
    expect(result.content[0].text).toBe('unknown tool');
  });
});

describe('mcp argument validation', () => {
  it('rejects unknown arguments', async () => {
    await useTempHome();
    const result = await callTool('approval_count', { foo: 'bar' });
    expect(result.isError).toBe(true);
  });

  it('rejects non plain-object arguments', async () => {
    await useTempHome();
    const result = await callTool('approval_count', new Date());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('invalid arguments');
  });

  it('rejects a blank required string', async () => {
    await useTempHome();
    expect((await callTool('mail_search', { query: '' })).isError).toBe(true);
    expect((await callTool('login', {})).isError).toBe(true);
  });

  it('requires either ids or a single id to delete mail', async () => {
    await useTempHome();
    await saveConfig({ base_url: 'http://example.com' });
    const result = await callTool('mail_delete', {});
    expect(result.isError).toBe(true);
  });

  it('treats missing arguments as an empty object', async () => {
    await useTempHome();
    const result = await callTool('config_show', undefined);
    expect(result.isError).toBe(false);
  });
});

describe('mcp config tool', () => {
  it('persists config and reports it without leaking the password', async () => {
    const tmp = await useTempHome();
    const result = await callTool('config_set', {
      base_url: 'http://example.com',
      password: 'secret',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).not.toContain('secret');
    expect(result.structuredContent?.password).toBe('***');

    const saved = JSON.parse(await fs.readFile(path.join(tmp, '.daou', 'config.json'), 'utf8')) as {
      base_url?: string;
      password?: string;
    };
    expect(saved.base_url).toBe('http://example.com');
    expect(saved.password).not.toBe('secret');
  });
});
