import { afterEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { homeDir, loadConfig, loadSession, saveConfig, saveSession } from './storage.js';

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  vi.unstubAllEnvs();
});

describe('storage', () => {
  it('resolves homeDir under HOME/.daou', () => {
    process.env.HOME = '/tmp/daou-home';
    expect(homeDir()).toBe(path.join('/tmp/daou-home', '.daou'));
  });

  it('loads default config when missing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    expect(await loadConfig()).toEqual({});
  });

  it('saves and loads session roundtrip', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    await saveSession({ user_id: 7, username: 'test' });
    const session = await loadSession();
    expect(session.user_id).toBe(7);
    expect(session.username).toBe('test');
    expect(session.saved_at).toBeTruthy();
  });

  it('saves config with attend enabled', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    await saveConfig({ base_url: '', attend: true });
    const cfg = await loadConfig();
    expect(cfg.attend).toBe(true);
  });

  it('stores password encrypted at rest', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
    process.env.HOME = tmp;
    await saveConfig({ base_url: '', username: 'u', password: 'secret' });
    const configFile = await fs.readFile(path.join(tmp, '.daou', 'config.json'), 'utf8');
    expect(configFile).not.toContain('secret');
    const cfg = await loadConfig();
    expect(cfg.password).toBe('secret');
  });
});
