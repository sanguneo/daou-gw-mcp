import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { handleMcpRequest, toolsList } from './mcp.js';
import { saveConfig } from './lib/storage.js';

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
});

describe('mcp tools', () => {
  it('hides attend tools until enabled', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-mcp-'));
    process.env.HOME = tmp;

    const namesBefore = (await toolsList()).map((tool) => (tool as { name: string }).name);
    expect(namesBefore).not.toContain('attend_status');
    expect(namesBefore).not.toContain('attend_in');
    expect(namesBefore).not.toContain('attend_out');

    await saveConfig({ base_url: 'http://example.com', attend: true });
    const namesAfter = (await toolsList()).map((tool) => (tool as { name: string }).name);
    expect(namesAfter).toContain('config_set');
    expect(namesAfter).toContain('attend_status');
    expect(namesAfter).toContain('attend_in');
    expect(namesAfter).toContain('attend_out');
    expect(namesAfter).toContain('mail_search');
    expect(namesAfter).toContain('calendar_list');
    expect(namesAfter).toContain('approval_count');
    expect(namesAfter).toContain('board_post_create');
    expect(namesAfter).toContain('board_post_update');
  });

  it('marks required arguments and closes schemas', async () => {
    const tools = (await toolsList()) as Array<{ name: string; inputSchema: { required?: string[]; additionalProperties?: boolean; anyOf?: unknown[] } }>;
    const login = tools.find((tool) => tool.name === 'login');
    const search = tools.find((tool) => tool.name === 'mail_search');
    const deleteTool = tools.find((tool) => tool.name === 'mail_delete');

    expect(login?.inputSchema.required).toEqual(expect.arrayContaining(['username', 'password']));
    expect(search?.inputSchema.required).toEqual(['query']);
    expect(deleteTool?.inputSchema.anyOf).toBeTruthy();
    expect(deleteTool?.inputSchema.additionalProperties).toBe(false);
    expect((deleteTool?.inputSchema as { anyOf?: Array<{ required?: string[] }> }).anyOf?.length).toBe(2);
    expect((deleteTool?.inputSchema as { properties?: { folder?: unknown } }).properties?.folder).toBeTruthy();
    expect(login?.inputSchema.additionalProperties).toBe(false);
    expect(search?.inputSchema.additionalProperties).toBe(false);
  });

  it('rejects empty runtime args without writing config', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-mcp-'));
    process.env.HOME = tmp;

    const invalidLogin = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'login', arguments: null as unknown as Record<string, unknown> } });
    const searchResp = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'mail_search', arguments: { query: '' } } });
    const deleteResp = await handleMcpRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mail_delete', arguments: {} } });
    const extraArgs = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'approval_count', arguments: { foo: 'bar' } } });
    const exoticArgs = await handleMcpRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'approval_count', arguments: new Date() as unknown as Record<string, unknown> } });
    const noArgs = await handleMcpRequest({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'approval_count' } });
    const setConfig = await handleMcpRequest({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'config_set', arguments: { base_url: 'http://example.com', attend: true } } });

    expect(invalidLogin.result && typeof invalidLogin.result === 'object' ? (invalidLogin.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(searchResp.result && typeof searchResp.result === 'object' ? (searchResp.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(deleteResp.result && typeof deleteResp.result === 'object' ? (deleteResp.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(extraArgs.result && typeof extraArgs.result === 'object' ? (extraArgs.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(exoticArgs.result && typeof exoticArgs.result === 'object' ? (exoticArgs.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(noArgs.result && typeof noArgs.result === 'object' ? (noArgs.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: true });
    expect(setConfig.result && typeof setConfig.result === 'object' ? (setConfig.result as { isError?: boolean; content?: Array<{ text: string }> }) : null).toMatchObject({ isError: false });

    const cfg = JSON.parse(await fs.readFile(path.join(tmp, '.daou', 'config.json'), 'utf8')) as { base_url?: string; attend?: boolean };
    expect(cfg.base_url).toBe('http://example.com');
    expect(cfg.attend).toBe(true);
  });
});
