import { z } from 'zod';
import type { Config } from './types.js';

/**
 * Single source of truth for every configurable field.
 *
 * Adding a setting means adding one entry here: it automatically gains a
 * `config set` CLI flag, a `config_set` MCP argument, and an env fallback.
 */
export interface ConfigFieldSpec {
  key: Exclude<keyof Config, 'saved_at'>;
  type: 'string' | 'boolean';
  /** Environment variable consulted when the config file has no value. */
  env: string;
  describe: string;
  /** Never echoed back in plain text. */
  secret?: boolean;
}

export const CONFIG_FIELDS: ConfigFieldSpec[] = [
  { key: 'base_url', type: 'string', env: 'DAOU_BASE_URL', describe: 'Daou groupware base URL' },
  { key: 'username', type: 'string', env: 'DAOU_USERNAME', describe: 'Login id' },
  { key: 'password', type: 'string', env: 'DAOU_PASSWORD', describe: 'Login password (encrypted at rest)', secret: true },
  { key: 'attend', type: 'boolean', env: 'DAOU_ATTEND', describe: 'Expose the attendance (clock in/out) feature' },
  { key: 'mail_list_url', type: 'string', env: 'DAOU_MAIL_LIST_URL', describe: 'Override mail list endpoint' },
  { key: 'mail_search_url', type: 'string', env: 'DAOU_MAIL_SEARCH_URL', describe: 'Override mail search endpoint' },
  { key: 'mail_delete_url', type: 'string', env: 'DAOU_MAIL_DELETE_URL', describe: 'Override mail delete endpoint' },
  { key: 'mail_send_url', type: 'string', env: 'DAOU_MAIL_SEND_URL', describe: 'Override mail send endpoint' },
  { key: 'mail_image_upload_url', type: 'string', env: 'DAOU_MAIL_IMAGE_UPLOAD_URL', describe: 'Override mail image upload endpoint' },
  { key: 'mail_sender_email', type: 'string', env: 'DAOU_MAIL_SENDER_EMAIL', describe: 'Default mail sender address' },
  { key: 'mail_sender_name', type: 'string', env: 'DAOU_MAIL_SENDER_NAME', describe: 'Default mail sender name' },
  { key: 'board_create_url', type: 'string', env: 'DAOU_BOARD_CREATE_URL', describe: 'Override board create endpoint' },
  { key: 'board_update_url', type: 'string', env: 'DAOU_BOARD_UPDATE_URL', describe: 'Override board update endpoint' },
  { key: 'board_attach_url', type: 'string', env: 'DAOU_BOARD_ATTACH_URL', describe: 'Override board attach endpoint' },
  { key: 'board_image_upload_url', type: 'string', env: 'DAOU_BOARD_IMAGE_UPLOAD_URL', describe: 'Override board image upload endpoint' },
];

/** Input schema shared by `config set` (CLI) and `config_set` (MCP). */
export const ConfigPatchSchema = z.strictObject(
  Object.fromEntries(
    CONFIG_FIELDS.map((field) => [
      field.key,
      (field.type === 'boolean' ? z.boolean() : z.string()).optional().describe(field.describe),
    ]),
  ) as Record<string, z.ZodOptional<z.ZodString | z.ZodBoolean>>,
);

export type ConfigPatch = Partial<Record<ConfigFieldSpec['key'], string | boolean>>;

function envValue(name: string): string {
  return (process.env[name] ?? '').trim();
}

function parseBoolean(raw: string): boolean | undefined {
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/**
 * Fill unset config fields from `DAOU_*` environment variables.
 * Stored config always wins; env is a fallback only.
 */
export function applyEnvFallbacks(cfg: Config): Config {
  const out: Config = { ...cfg };
  for (const field of CONFIG_FIELDS) {
    if (out[field.key] !== undefined && out[field.key] !== '') continue;
    const raw = envValue(field.env);
    if (!raw) continue;
    if (field.type === 'boolean') {
      const parsed = parseBoolean(raw);
      if (parsed !== undefined) out[field.key] = parsed as never;
    } else {
      out[field.key] = raw as never;
    }
  }
  return out;
}

/** Merge a patch into config, ignoring blank strings so flags never wipe values. */
export function mergeConfig(cfg: Config, patch: ConfigPatch): Config {
  const out: Config = { ...cfg };
  for (const field of CONFIG_FIELDS) {
    const value = patch[field.key];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) continue;
      out[field.key] = trimmed as never;
    } else {
      out[field.key] = value as never;
    }
  }
  return out;
}

/** Attendance is opt-in; every surface asks this before exposing the feature. */
export function attendEnabled(cfg: Config): boolean {
  return cfg.attend === true;
}
