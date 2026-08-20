import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { homeDir, loadConfig, loadSession, saveConfig, saveSession } from '../core/storage.js';
import { useTempHome } from './helpers.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('storage', () => {
  it('resolves the config directory under the home directory', async () => {
    const tmp = await useTempHome();
    expect(homeDir()).toBe(path.join(tmp, '.daou'));
  });

  it('returns an empty config when nothing is saved', async () => {
    await useTempHome();
    expect(await loadConfig()).toEqual({});
  });

  it('round-trips a session', async () => {
    await useTempHome();
    await saveSession({ user_id: 7, username: 'test' });
    const session = await loadSession();
    expect(session.user_id).toBe(7);
    expect(session.username).toBe('test');
    expect(session.saved_at).toBeTruthy();
  });

  it('encrypts the password at rest and decrypts it on read', async () => {
    const tmp = await useTempHome();
    await saveConfig({ base_url: 'http://example.com', username: 'u', password: 'secret' });

    const onDisk = await fs.readFile(path.join(tmp, '.daou', 'config.json'), 'utf8');
    expect(onDisk).not.toContain('secret');
    expect(onDisk).toContain('enc:v1:');
    expect((await loadConfig()).password).toBe('secret');
  });

  it('re-encrypts a legacy plaintext password on first read', async () => {
    const tmp = await useTempHome();
    const configFile = path.join(tmp, '.daou', 'config.json');
    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify({ base_url: 'http://example.com', password: 'plain' }));

    expect((await loadConfig()).password).toBe('plain');
    expect(await fs.readFile(configFile, 'utf8')).not.toContain('plain');
  });

  it('keeps the attendance switch', async () => {
    await useTempHome();
    await saveConfig({ attend: true });
    expect((await loadConfig()).attend).toBe(true);
  });
});

describe('environment fallbacks', () => {
  it('fills unset fields from DAOU_* variables', async () => {
    await useTempHome();
    vi.stubEnv('DAOU_BASE_URL', 'http://from-env.example.com');
    vi.stubEnv('DAOU_MAIL_SENDER_EMAIL', 'env@example.com');
    vi.stubEnv('DAOU_ATTEND', 'true');

    const cfg = await loadConfig();
    expect(cfg.base_url).toBe('http://from-env.example.com');
    expect(cfg.mail_sender_email).toBe('env@example.com');
    expect(cfg.attend).toBe(true);
  });

  it('lets a saved value win over the environment', async () => {
    await useTempHome();
    await saveConfig({ base_url: 'http://saved.example.com' });
    vi.stubEnv('DAOU_BASE_URL', 'http://from-env.example.com');

    expect((await loadConfig()).base_url).toBe('http://saved.example.com');
  });

  it('ignores an unparseable boolean variable', async () => {
    await useTempHome();
    vi.stubEnv('DAOU_ATTEND', 'maybe');
    expect((await loadConfig()).attend).toBeUndefined();
  });
});
