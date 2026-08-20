import { parseJsonMaybe } from '../core/http.js';

function pickId(parsed: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = parsed[key];
    if (typeof value === 'number' || typeof value === 'string') return String(value);
  }
  const data = parsed.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return pickId(data as Record<string, unknown>, keys);
  }
  return undefined;
}

export function formatBoardResult(raw: string, mode: 'create' | 'update' | 'attach'): string {
  const parsed = parseJsonMaybe(raw) as Record<string, unknown>;
  if (mode === 'attach') {
    const attachId = pickId(parsed, ['attachId', 'id']);
    return attachId ? `attach ok: ${attachId}\n` : 'attach ok\n';
  }
  const postId = pickId(parsed, ['postId', 'id']);
  return postId ? `${mode} ok: ${postId}\n` : `${mode} ok\n`;
}
