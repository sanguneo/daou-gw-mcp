export const KST = 'Asia/Seoul';

/** `YYYY-MM-DD` in Korea Standard Time. */
export function todayKst(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

export function addDaysKst(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return todayKst(d);
}

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const WEEKDAY_KO: Record<string, string> = { Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금', Sat: '토', Sun: '일' };

function weekdayKey(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: KST, weekday: 'short' }).format(new Date(`${date}T00:00:00.000+09:00`));
}

export function weekdayKo(date: string): string {
  return WEEKDAY_KO[weekdayKey(date)] ?? '';
}

/** Monday-to-Sunday range containing the given date. */
export function weekRangeKst(date: string): { from: string; to: string } {
  const from = addDaysKst(date, -(WEEKDAY_INDEX[weekdayKey(date)] ?? 0));
  return { from, to: addDaysKst(from, 6) };
}

/** First-to-last day of the month containing the given date. */
export function monthRangeKst(date: string): { from: string; to: string } {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  const from = `${date.slice(0, 7)}-01`;
  const nextFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { from, to: addDaysKst(nextFirst, -1) };
}

export function isWeekendKst(date: string): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: KST, weekday: 'short' }).format(new Date(`${date}T00:00:00.000+09:00`));
  return weekday === 'Sat' || weekday === 'Sun';
}

function intlDateTime(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: KST, hour12: false, ...options });
}

/** `YYYY-MM-DD HH:mm:ss` in KST, or the original string when unparseable. */
export function formatStamp(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return intlDateTime({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date).replace(/\. /g, '-').replace(/\./g, '').replace(/\s+/g, ' ');
}

export function formatDateOnly(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return todayKst(date);
}

export function formatTimeOnly(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return intlDateTime({ hour: '2-digit', minute: '2-digit' }).format(date).replace(/\s+/g, '');
}
