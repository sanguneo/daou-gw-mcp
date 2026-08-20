import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { applyEnvFallbacks } from './config.js';
import type { Config, Session } from './types.js';

export const DAOU_DIR_NAME = '.daou';
export const CONFIG_FILE = 'config.json';
export const SESSION_FILE = 'session.json';
export const DIRECTORY_FILE = 'directory.json';

const PASSWORD_PREFIX = 'enc:v1:';
const VAULT_KEY_FILE = 'vault.key';
const VAULT_ALGO = 'aes-256-gcm';
const VAULT_KEY_BYTES = 32;
const VAULT_IV_BYTES = 12;

export function homeDir(): string {
  return path.join(os.homedir(), DAOU_DIR_NAME);
}

export async function ensureHome(): Promise<string> {
  const dir = homeDir();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export async function configPath(): Promise<string> {
  return path.join(await ensureHome(), CONFIG_FILE);
}

export async function sessionPath(): Promise<string> {
  return path.join(await ensureHome(), SESSION_FILE);
}

async function vaultKeyPath(): Promise<string> {
  return path.join(await ensureHome(), VAULT_KEY_FILE);
}

async function loadOrCreateVaultKey(): Promise<Buffer> {
  const target = await vaultKeyPath();
  try {
    const raw = await fs.readFile(target);
    if (raw.length !== VAULT_KEY_BYTES) throw new Error(`invalid vault key length: ${raw.length}`);
    return raw;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
    const key = randomBytes(VAULT_KEY_BYTES);
    await fs.writeFile(target, key, { mode: 0o600 });
    return key;
  }
}

async function encryptPassword(value: string): Promise<string> {
  const key = await loadOrCreateVaultKey();
  const iv = randomBytes(VAULT_IV_BYTES);
  const cipher = createCipheriv(VAULT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PASSWORD_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

async function decryptPassword(value: string): Promise<string> {
  const key = await loadOrCreateVaultKey();
  const body = value.startsWith(PASSWORD_PREFIX) ? value.slice(PASSWORD_PREFIX.length) : value;
  const parts = body.split('.');
  if (parts.length !== 3) throw new Error('invalid encrypted password format');
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(VAULT_ALGO, key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function writeJsonPrivate(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
}

/**
 * Read config, decrypt the password, and fall back to `DAOU_*` env vars for
 * anything still unset. A legacy plaintext password is re-encrypted in place.
 */
export async function loadConfig(): Promise<Config> {
  const target = await configPath();
  let stored: Config;
  try {
    stored = await readJson<Config>(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return applyEnvFallbacks({});
    throw err;
  }
  if (stored.password) {
    if (stored.password.startsWith(PASSWORD_PREFIX)) {
      stored = { ...stored, password: await decryptPassword(stored.password) };
    } else {
      await writeJsonPrivate(target, { ...stored, password: await encryptPassword(stored.password) });
    }
  }
  return applyEnvFallbacks(stored);
}

export async function saveConfig(cfg: Config): Promise<void> {
  const next: Config = { ...cfg, saved_at: cfg.saved_at ?? new Date().toISOString() };
  if (next.password) next.password = await encryptPassword(next.password);
  await writeJsonPrivate(await configPath(), next);
}

export async function loadSession(): Promise<Session> {
  try {
    return await readJson<Session>(await sessionPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await writeJsonPrivate(await sessionPath(), { ...session, saved_at: new Date().toISOString() });
}

export interface DirectoryCache<T> {
  saved_at: string;
  entries: T[];
}

async function directoryPath(): Promise<string> {
  return path.join(await ensureHome(), DIRECTORY_FILE);
}

/** Locally cached employee directory, or null when it was never fetched. */
export async function loadDirectoryCache<T>(): Promise<DirectoryCache<T> | null> {
  try {
    return await readJson<DirectoryCache<T>>(await directoryPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveDirectoryCache<T>(entries: T[]): Promise<void> {
  await writeJsonPrivate(await directoryPath(), { saved_at: new Date().toISOString(), entries });
}

export function cacheAgeHours(cache: { saved_at: string }): number {
  const saved = new Date(cache.saved_at).getTime();
  if (Number.isNaN(saved)) return Number.POSITIVE_INFINITY;
  return (Date.now() - saved) / 3_600_000;
}
