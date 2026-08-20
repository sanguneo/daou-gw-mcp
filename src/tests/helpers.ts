import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { vi } from 'vitest';
import { CONFIG_FIELDS } from '../core/config.js';

/**
 * Point `~/.daou` at a throwaway directory and neutralise any real `DAOU_*`
 * variables so a developer's own environment cannot influence a test.
 */
export async function useTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'daou-gw-'));
  vi.stubEnv('HOME', dir);
  vi.stubEnv('USERPROFILE', dir);
  for (const field of CONFIG_FIELDS) vi.stubEnv(field.env, '');
  return dir;
}

export interface MockServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<MockServer> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

export function json(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

export async function captureStdout<T>(fn: () => Promise<T>): Promise<{ value: T; output: string; stderr: string }> {
  let output = '';
  let stderr = '';
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    output += String(chunk);
    return true;
  });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
    stderr += String(chunk);
    return true;
  });
  try {
    return { value: await fn(), output, stderr };
  } finally {
    out.mockRestore();
    err.mockRestore();
  }
}

/** Session id used by every mock server below. */
export const SESSION_USER = { id: 7, name: 'tester' };
