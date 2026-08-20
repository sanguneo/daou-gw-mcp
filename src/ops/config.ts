import { z } from 'zod';
import { ConfigPatchSchema, mergeConfig, type ConfigPatch } from '../core/config.js';
import { defineOperation } from '../core/registry.js';
import { saveConfig } from '../core/storage.js';
import { formatConfig } from '../render/config.js';
import type { Config } from '../core/types.js';

/** Never hand the decrypted password back to a caller. */
function redact(cfg: Config): Config {
  return { ...cfg, password: cfg.password ? '***' : undefined };
}

export const configShow = defineOperation({
  id: 'config.show',
  tool: 'config_show',
  cli: ['config', 'show'],
  summary: 'Show local daou-gw config',
  input: z.strictObject({}),
  run: async (ctx) => ({ data: redact(ctx.cfg), text: formatConfig(ctx.cfg) }),
});

export const configSet = defineOperation({
  id: 'config.set',
  tool: 'config_set',
  cli: ['config', 'set'],
  summary: 'Update local daou-gw config in ~/.daou/config.json',
  input: ConfigPatchSchema,
  run: async (ctx, input) => {
    const next = mergeConfig(ctx.cfg, input as ConfigPatch);
    await saveConfig(next);
    return { data: redact(next), text: formatConfig(next) };
  },
});

export const configOperations = [configShow, configSet];
