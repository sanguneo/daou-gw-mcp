import { z } from 'zod';
import { loadContext, requireSession } from '../core/context.js';
import { findByTool, operationJsonSchema, visibleOperations, type Operation } from '../core/registry.js';
import { loadConfig } from '../core/storage.js';
import { OPERATIONS } from '../ops/index.js';

export const SERVER_INFO = { name: 'daou-gw-cli', version: '0.3.0' } as const;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError: boolean;
  /** The SDK result type is an open record; this keeps us structurally compatible. */
  [key: string]: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function toolFrom(op: Operation): McpTool {
  return { name: op.tool, description: op.summary, inputSchema: operationJsonSchema(op) };
}

/** Tools currently exposed by the operation registry. */
export async function listTools(): Promise<McpTool[]> {
  const cfg = await loadConfig();
  return visibleOperations(OPERATIONS, cfg).map(toolFrom);
}

function fail(text: string): ToolCallResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}

export async function callTool(name: string, args: unknown): Promise<ToolCallResult> {
  const cfg = await loadConfig();
  const op = findByTool(visibleOperations(OPERATIONS, cfg), name);
  if (!op) return fail('unknown tool');

  if (args !== undefined && !isPlainObject(args)) return fail('invalid arguments');

  const parsed = op.input.safeParse(args ?? {});
  if (!parsed.success) return fail(formatZodError(parsed.error));

  try {
    const ctx = op.auth ? await requireSession() : await loadContext();
    const result = await op.run(ctx, parsed.data);
    return {
      content: [{ type: 'text', text: result.text }],
      structuredContent: isPlainObject(result.data) ? result.data : { result: result.data },
      isError: false,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
