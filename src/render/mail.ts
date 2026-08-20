import { formatStamp } from '../core/time.js';
import { extractArray, isRecord, lines, tryParseJson } from './common.js';

function formatEntry(entry: any, index: number): string {
  if (!isRecord(entry)) return `${index}. -`;
  const seen = typeof entry.seen === 'boolean' ? entry.seen : undefined;
  const subject = typeof entry.subject === 'string' && entry.subject.trim() ? entry.subject.trim() : '-';
  const from = [entry.fromToSimple, entry.from]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '-';
  const date = formatStamp(
    [entry.dateUtc, entry.sentDateUtc].find((value): value is string => typeof value === 'string'),
  );
  const id = entry.id === undefined || entry.id === null ? '-' : String(entry.id);
  const flag = seen === undefined ? '-' : seen ? '읽음' : '안읽음';
  return `${index}. [${flag}] ${date} | ${from} | ${subject} (id: ${id})`;
}

export function formatMailList(raw: string, action: 'list' | 'search', displayLimit?: number): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return lines(`메일 ${action === 'list' ? '목록' : '검색'}`, `- 응답: ${raw.trim()}`);

  const items = extractArray(parsed);
  const shown = typeof displayLimit === 'number' ? Math.min(displayLimit, items.length) : items.length;
  return lines(
    `메일 ${action === 'list' ? '목록' : '검색'}`,
    `- 항목 수: ${items.length}`,
    `- 표시 수: ${shown}`,
    ...items.slice(0, shown).map((item, index) => formatEntry(item, index + 1)),
  );
}

export function formatMailAction(raw: string, action: 'delete' | 'send'): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return lines(`메일 ${action === 'delete' ? '삭제' : '발송'}`, `- 응답: ${raw.trim()}`);
  return lines(
    `메일 ${action === 'delete' ? '삭제' : '발송'}`,
    `- 결과: ${typeof parsed.ok === 'boolean' ? (parsed.ok ? '성공' : '실패') : '성공'}`,
    `- 상태: ${typeof parsed.status === 'number' ? parsed.status : '-'}`,
    `- endpoint: ${typeof parsed.endpoint === 'string' ? parsed.endpoint : '-'}`,
  );
}
