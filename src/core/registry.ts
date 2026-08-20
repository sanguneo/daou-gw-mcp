import { z } from 'zod';
import type { Context } from './context.js';
import type { Config } from './types.js';

/** Every operation returns both a machine payload and a human rendering. */
export interface OperationResult {
  /** Emitted by `--json` and carried as MCP structured content. */
  data: unknown;
  /** Emitted by default on the CLI and as MCP text content. */
  text: string;
}

export interface Operation<I = unknown> {
  /** Stable identifier, e.g. `mail.list`. */
  id: string;
  /** MCP tool name, e.g. `mail_list`. */
  tool: string;
  /** CLI path, e.g. `['mail', 'list']`. */
  cli: string[];
  summary: string;
  input: z.ZodType<I>;
  /**
   * JSON Schema fragment merged into the generated tool schema for
   * constraints zod cannot express (such as `anyOf` across fields).
   */
  schemaExtra?: Record<string, unknown>;
  /** Resolve and validate a session before running. */
  auth?: boolean;
  /** Hide from both surfaces when this returns true. */
  hidden?: (cfg: Config) => boolean;
  /**
   * Rename generated CLI flags, keyed by schema property.
   * `{ sender_email: 'from-email' }` turns `--sender-email` into `--from-email`.
   */
  cliAlias?: Record<string, string>;
  /**
   * Schema properties with no CLI flag, because another flag already covers
   * them (a repeatable `--id` feeds the `ids` array, so scalar `id` is
   * MCP-only).
   */
  cliHidden?: string[];
  /** CLI-only conveniences that feed the schema, such as reading a file into a field. */
  cliExtras?: CliExtraOption[];
  run: (ctx: Context, input: I) => Promise<OperationResult>;
}

export interface CliExtraOption {
  /** commander flag definition, e.g. `--html-file <path>`. */
  flag: string;
  describe: string;
  /** Fold the raw flag value into the input object before validation. */
  apply: (value: string, input: Record<string, unknown>) => Promise<void> | void;
}

/** Preserves the inferred input type from the zod schema. */
export function defineOperation<S extends z.ZodType>(
  op: Omit<Operation<z.infer<S>>, 'input'> & { input: S },
): Operation<z.infer<S>> {
  return op as Operation<z.infer<S>>;
}

const SAFE_INT_MAX = 9007199254740991;

/** zod emits safe-integer bounds for `.int()`; they are noise in a tool schema. */
function stripIntegerNoise(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripIntegerNoise);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'maximum' && value === SAFE_INT_MAX) continue;
    if (key === 'minimum' && value === -SAFE_INT_MAX) continue;
    out[key] = stripIntegerNoise(value);
  }
  return out;
}

/** Build the JSON Schema advertised to MCP clients and used to derive CLI flags. */
export function operationJsonSchema(op: Operation): Record<string, unknown> {
  const generated = z.toJSONSchema(op.input, { io: 'input' }) as Record<string, unknown>;
  const { $schema: _schema, ...rest } = generated;
  const schema = stripIntegerNoise(rest) as Record<string, unknown>;
  return {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
    ...schema,
    ...(op.schemaExtra ?? {}),
  };
}

export function isVisible(op: Operation, cfg: Config): boolean {
  return !op.hidden?.(cfg);
}

export function visibleOperations(ops: Operation[], cfg: Config): Operation[] {
  return ops.filter((op) => isVisible(op, cfg));
}

export function findByTool(ops: Operation[], tool: string): Operation | undefined {
  return ops.find((op) => op.tool === tool);
}

/** Render a result payload the way `--json` should print it. */
export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Convenience for operations whose payload is an already-serialized API body. */
export function rawResult(raw: string, text: string): OperationResult {
  return { data: safeParse(raw), text };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
