export function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function dash(value?: string): string {
  return value && value.trim() ? value : '-';
}

export function yesNo(value: boolean | undefined): string {
  return value ? '예' : '아니오';
}

/** Trim decorative dashes/space that Daou wraps around some labels. */
export function cleanLabel(value?: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.replace(/^[-\s]+/, '').replace(/[-\s]+$/, '').trim();
}

/** Daou nests list payloads under a handful of different keys. */
export function extractArray(value: any): any[] {
  const candidates = [
    value?.data?.messageList,
    value?.data,
    value?.items,
    value?.list,
    value?.results,
    value?.rows,
    value?.contents,
    value?.messageList,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return Array.isArray(value) ? value : [];
}

export function countItems(value: any): number {
  return extractArray(value).length;
}

export function lines(...values: Array<string | null | undefined>): string {
  return `${values.filter((value): value is string => value !== null && value !== undefined).join('\n')}\n`;
}
