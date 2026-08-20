import { Command } from 'commander';
import { z } from 'zod';
import { loadContext, requireSession } from '../core/context.js';
import { jsonText, operationJsonSchema, visibleOperations, type Operation } from '../core/registry.js';
import { OPERATIONS } from '../ops/index.js';
import type { Config } from '../core/types.js';

interface JsonSchemaProperty {
  type?: string;
  description?: string;
  items?: { type?: string };
  enum?: unknown[];
  default?: unknown;
}

interface CliOption {
  /** Schema property this option feeds. */
  key: string;
  /** camelCase key commander stores the value under. */
  optionKey: string;
  type: string;
  isArray: boolean;
}

function toKebab(value: string): string {
  return value.replace(/_/g, '-');
}

function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
}

const FALSEY = new Set(['false', '0', 'no', 'off']);

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  return !FALSEY.has(value.trim().toLowerCase());
}

function describeOption(prop: JsonSchemaProperty, required: boolean): string {
  const parts: string[] = [];
  if (prop.description) parts.push(prop.description);
  if (Array.isArray(prop.enum)) parts.push(`one of: ${prop.enum.join(', ')}`);
  if (prop.default !== undefined) parts.push(`default: ${String(prop.default)}`);
  if (required) parts.push('(required)');
  return parts.join(' ');
}

/** Turn one operation's JSON Schema into commander options. */
function attachOptions(command: Command, op: Operation): CliOption[] {
  const schema = operationJsonSchema(op);
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>;
  const required = new Set((schema.required ?? []) as string[]);
  const options: CliOption[] = [];

  const skipped = new Set(op.cliHidden ?? []);
  for (const [key, prop] of Object.entries(properties)) {
    if (skipped.has(key)) continue;
    const flagName = op.cliAlias?.[key] ?? toKebab(key);
    const isArray = prop.type === 'array';
    const type = isArray ? (prop.items?.type ?? 'string') : (prop.type ?? 'string');
    const help = describeOption(prop, required.has(key));

    if (type === 'boolean' && !isArray) {
      command.option(`--${flagName} [value]`, help);
    } else if (isArray) {
      command.option(`--${flagName} <value>`, help, (value: string, previous: string[] = []) => [...previous, value]);
    } else {
      command.option(`--${flagName} <value>`, help);
    }
    options.push({ key, optionKey: toCamel(flagName), type, isArray });
  }

  for (const extra of op.cliExtras ?? []) {
    command.option(extra.flag, extra.describe);
  }
  return options;
}

/** Commander hands back strings; the schema decides what they should become. */
function coerce(value: unknown, type: string): unknown {
  if (type === 'integer' || type === 'number') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  if (type === 'boolean') return parseBooleanFlag(value);
  return value;
}

function collectInput(opts: Record<string, unknown>, options: CliOption[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const option of options) {
    const raw = opts[option.optionKey];
    if (raw === undefined) continue;
    input[option.key] = option.isArray
      ? (Array.isArray(raw) ? raw : [raw]).map((item) => coerce(item, option.type))
      : coerce(raw, option.type);
  }
  return input;
}

function extraOptionKey(flag: string): string {
  const match = flag.match(/--([a-z0-9-]+)/i);
  return match ? toCamel(match[1]) : '';
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

async function execute(op: Operation, opts: Record<string, unknown>, options: CliOption[]): Promise<number> {
  const input = collectInput(opts, options);
  for (const extra of op.cliExtras ?? []) {
    const value = opts[extraOptionKey(extra.flag)];
    if (typeof value === 'string') await extra.apply(value, input);
  }

  const parsed = op.input.safeParse(input);
  if (!parsed.success) {
    process.stderr.write(`${formatZodError(parsed.error)}\n`);
    return 1;
  }

  const ctx = op.auth ? await requireSession() : await loadContext();
  const result = await op.run(ctx, parsed.data);
  process.stdout.write(opts.json === true ? jsonText(result.data) : result.text);
  return 0;
}

/** Group operations by their first CLI segment so `mail list` nests under `mail`. */
function buildProgram(ops: Operation[], exitCode: { value: number }): Command {
  const program = new Command();
  program
    .name('daou-gw-cli')
    .description('Daou Office groupware CLI')
    .helpOption('-h, --help', 'Show help')
    .option('--json', 'Print the raw JSON payload')
    .enablePositionalOptions();

  const groups = new Map<string, Command>();

  for (const op of ops) {
    const [head, ...rest] = op.cli;
    let parent = program;
    if (rest.length > 0) {
      let group = groups.get(head);
      if (!group) {
        group = program.command(head).description(`${head} commands`).enablePositionalOptions();
        groups.set(head, group);
      }
      parent = group;
    }

    const command = parent.command(rest.length > 0 ? rest.join(' ') : head).description(op.summary);
    command.option('--json', 'Print the raw JSON payload');
    const options = attachOptions(command, op);
    command.action(async (opts: Record<string, unknown>) => {
      exitCode.value = await execute(op, opts, options);
    });
  }
  return program;
}

export async function runCli(argv: string[]): Promise<number> {
  const args = [...argv];
  const attendOverride = args[0] === '--attend';
  if (attendOverride) args.shift();

  const { cfg } = await loadContext();
  const effective: Config = attendOverride ? { ...cfg, attend: true } : cfg;
  const ops = visibleOperations(OPERATIONS, effective);

  const exitCode = { value: 0 };
  const program = buildProgram(ops, exitCode);
  program.exitOverride();
  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
  });

  if (args.length === 0) {
    process.stdout.write(program.helpInformation());
    return 0;
  }

  try {
    await program.parseAsync(args, { from: 'user' });
    return exitCode.value;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'commander.helpDisplayed' || code === 'commander.help' || code === 'commander.version') return 0;
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
