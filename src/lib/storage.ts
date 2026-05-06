import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Config, Session } from './types.js';

export const DAOU_DIR_NAME = '.daou';
export const CONFIG_FILE = 'config.json';
export const SESSION_FILE = 'session.json';
export const COOKIES_FILE = 'cookies.json';
export const ENDPOINTS_FILE = 'endpoints.json';
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

export async function cookiesPath(): Promise<string> {
  return path.join(await ensureHome(), COOKIES_FILE);
}

export async function endpointsPath(): Promise<string> {
  return path.join(await ensureHome(), ENDPOINTS_FILE);
}

async function vaultKeyPath(): Promise<string> {
  return path.join(await ensureHome(), VAULT_KEY_FILE);
}

async function loadOrCreateVaultKey(): Promise<Buffer> {
  const p = await vaultKeyPath();
  try {
    const raw = await fs.readFile(p);
    if (raw.length !== VAULT_KEY_BYTES) {
      throw new Error(`invalid vault key length: ${raw.length}`);
    }
    return raw;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code !== 'ENOENT') throw err;
    const key = randomBytes(VAULT_KEY_BYTES);
    await fs.writeFile(p, key, { mode: 0o600 });
    return key;
  }
}

function encryptPasswordWithKey(password: string, key: Buffer): string {
  const iv = randomBytes(VAULT_IV_BYTES);
  const cipher = createCipheriv(VAULT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PASSWORD_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptPasswordWithKey(value: string, key: Buffer): string {
  const cipherText = value.startsWith(PASSWORD_PREFIX) ? value.slice(PASSWORD_PREFIX.length) : value;
  const parts = cipherText.split('.');
  if (parts.length !== 3) throw new Error('invalid encrypted password format');
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const data = Buffer.from(dataB64, 'base64url');
  const decipher = createDecipheriv(VAULT_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

async function encryptPassword(value: string): Promise<string> {
  const key = await loadOrCreateVaultKey();
  return encryptPasswordWithKey(value, key);
}

async function decryptPassword(value: string): Promise<string> {
  const key = await loadOrCreateVaultKey();
  return decryptPasswordWithKey(value, key);
}

async function normalizeConfigPassword(cfg: Config): Promise<{ cfg: Config; migrated: boolean }> {
  if (!cfg.password) return { cfg, migrated: false };
  if (cfg.password.startsWith(PASSWORD_PREFIX)) {
    return { cfg: { ...cfg, password: await decryptPassword(cfg.password) }, migrated: false };
  }
  return { cfg: { ...cfg, password: cfg.password }, migrated: true };
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function writeJsonPrivate(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export async function loadConfig(): Promise<Config> {
  const p = await configPath();
  try {
    const raw = await readJson<Config>(p);
    const { cfg, migrated } = await normalizeConfigPassword(raw);
    if (migrated) {
      await writeJsonPrivate(p, { ...cfg, password: await encryptPassword(cfg.password ?? '') });
    }
    return cfg;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveConfig(cfg: Config): Promise<void> {
  const next: Config = { ...cfg };
  if (next.password) {
    next.password = next.password.startsWith(PASSWORD_PREFIX) ? next.password : await encryptPassword(next.password);
  }
  if (!next.saved_at) next.saved_at = new Date().toISOString();
  await writeJsonPrivate(await configPath(), next);
}

export async function loadSession(): Promise<Session> {
  const p = await sessionPath();
  try {
    return await readJson<Session>(p);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') return {};
    throw err;
  }
}

export async function saveSession(session: Session): Promise<void> {
  const next: Session = { ...session, saved_at: new Date().toISOString() };
  await writeJsonPrivate(await sessionPath(), next);
}
