import type { Config, Session, AttendanceStatus } from './types.js';

const KST = 'Asia/Seoul';

function formatKst(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d).replace(/\. /g, '-').replace(/\. /g, '-').replace(/\./g, '').replace(/\s+/g, ' ');
}

function yesNo(v: boolean | undefined): string {
  return v ? '예' : '아니오';
}

function dash(v?: string): string {
  return v && v.trim() ? v : '-';
}

export function formatConfig(cfg: Config): string {
  const lines = [
    'Daou GW 설정',
    `- Username: ${dash(cfg.username)}`,
    `- Password: ${cfg.password?.trim() ? '저장됨' : '미저장'}`,
  ];
  if (cfg.base_url) {
    lines.push(`- Base URL: ${cfg.base_url}`);
  } else {
    lines.push('- Base URL: 없음', '- 경고: 로그인할 때 --base-url를 넣어줘');
  }
  if (cfg.attend) {
    lines.push(`- Attend: 활성화`);
  }
  if (cfg.mail_list_url || cfg.mail_search_url || cfg.mail_delete_url || cfg.mail_send_url || cfg.mail_image_upload_url || cfg.mail_sender_email || cfg.mail_sender_name) {
    lines.push(
      `- Mail List URL: ${dash(cfg.mail_list_url)}`,
      `- Mail Search URL: ${dash(cfg.mail_search_url)}`,
      `- Mail Delete URL: ${dash(cfg.mail_delete_url)}`,
      `- Mail Send URL: ${dash(cfg.mail_send_url)}`,
      `- Mail Image Upload URL: ${dash(cfg.mail_image_upload_url)}`,
      `- Mail Sender Email: ${dash(cfg.mail_sender_email)}`,
      `- Mail Sender Name: ${dash(cfg.mail_sender_name)}`,
    );
  }
  if (cfg.saved_at) {
    lines.push(`- 저장시각: ${formatKst(cfg.saved_at) ?? cfg.saved_at}`);
  }
  return `${lines.join('\n')}\n`;
}

export function formatSession(sess: Session): string {
  const lines = [
    'Daou GW 세션',
    `- User ID: ${sess.user_id ?? '-'}`,
    `- Username: ${dash(sess.username)}`,
    `- Base URL: ${dash(sess.base_url)}`,
    `- Cookies: ${sess.cookies?.length ?? 0}개`,
  ];
  if (sess.last_check) lines.push(`- 마지막 확인: ${formatKst(sess.last_check) ?? sess.last_check}`);
  if (sess.saved_at) lines.push(`- 저장시각: ${formatKst(sess.saved_at) ?? sess.saved_at}`);
  return `${lines.join('\n')}\n`;
}

export function formatAttendanceStatus(status: AttendanceStatus): string {
  const lines = [
    '근태 상태',
    `- 날짜: ${status.today}`,
    `- 근무구분: ${status.leave || '출근'}`,
    `- 공휴일: ${yesNo(status.holiday)}`,
    `- 출근: ${status.clockedIn ? '완료' : '미처리'}`,
    `- 퇴근: ${status.clockedOut ? '완료' : '미처리'}`,
  ];
  if (status.leaveSource) lines.push(`- 일정 출처: ${status.leaveSource}`);
  if (status.leaveEvent) lines.push(`- 일정 내용: ${status.leaveEvent}`);
  lines.push('');
  return lines.join('\n');
}

function tryParseJSON(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractArray(value: any): any[] {
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
  if (Array.isArray(value)) return value;
  return [];
}

function countItems(value: any): number {
  return extractArray(value).length;
}

function formatStamp(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d).replace(/\. /g, '-').replace(/\. /g, '-').replace(/\./g, '').replace(/\s+/g, ' ');
}

function formatDateOnly(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '00';
  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

function formatTimeOnly(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(/\s+/g, '');
}

function formatMailDate(value?: string): string {
  return formatStamp(value);
}

function formatMailEntry(entry: any, index: number): string {
  if (!isRecord(entry)) return `${index}. -`;
  const seen = typeof entry.seen === 'boolean' ? entry.seen : undefined;
  const subject = typeof entry.subject === 'string' && entry.subject.trim() ? entry.subject.trim() : '-';
  const from = typeof entry.fromToSimple === 'string' && entry.fromToSimple.trim()
    ? entry.fromToSimple.trim()
    : typeof entry.from === 'string' && entry.from.trim()
      ? entry.from.trim()
      : '-';
  const date = formatMailDate(typeof entry.dateUtc === 'string' ? entry.dateUtc : typeof entry.sentDateUtc === 'string' ? entry.sentDateUtc : undefined);
  const id = typeof entry.id === 'number' || typeof entry.id === 'string' ? String(entry.id) : '-';
  const flag = seen === undefined ? '-' : seen ? '읽음' : '안읽음';
  return `${index}. [${flag}] ${date} | ${from} | ${subject} (id: ${id})`;
}

function cleanLabel(value?: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.replace(/^[-\s]+/, '').replace(/[-\s]+$/, '').trim();
}

function formatCalendarEntry(entry: any, index: number, calendarNames: Map<string, string>): string {
  if (!isRecord(entry)) return `${index}. 내용 없음`;
  const title = cleanLabel(
    typeof entry.title === 'string' && entry.title.trim()
      ? entry.title.trim()
      : typeof entry.subject === 'string' && entry.subject.trim()
        ? entry.subject.trim()
        : typeof entry.eventName === 'string' && entry.eventName.trim()
          ? entry.eventName.trim()
          : typeof entry.summary === 'string' && entry.summary.trim()
            ? entry.summary.trim()
            : '',
  ) || '내용 없음';
  const start = typeof entry.startTime === 'string'
    ? entry.startTime
    : typeof entry.startDateTime === 'string'
      ? entry.startDateTime
      : typeof entry.start === 'string'
        ? entry.start
        : undefined;
  const end = typeof entry.endTime === 'string'
    ? entry.endTime
    : typeof entry.endDateTime === 'string'
      ? entry.endDateTime
      : typeof entry.end === 'string'
        ? entry.end
        : undefined;
  const allDay = entry.timeType === 'allday' || entry.allDay === true || entry.type === 'holiday';
  const place = cleanLabel(
    typeof entry.location === 'string' && entry.location.trim()
      ? entry.location.trim()
      : typeof entry.place === 'string' && entry.place.trim()
        ? entry.place.trim()
        : typeof entry.room === 'string' && entry.room.trim()
          ? entry.room.trim()
          : '',
  );
  const calendarId = typeof entry.calendarId === 'number' || typeof entry.calendarId === 'string' ? String(entry.calendarId) : '';
  const calendarName = cleanLabel(calendarNames.get(calendarId) ?? '') || (calendarId ? `캘린더 ${calendarId}` : '');
  const dateLabel = allDay
    ? formatDateOnly(start ?? end)
    : `${formatDateOnly(start)} ${formatTimeOnly(start)}~${formatTimeOnly(end)}`;
  const placeLabel = place ? ` | ${place}` : '';
  const calendarLabel = calendarName ? ` | ${calendarName}` : '';
  return `${index}. ${dateLabel} | ${title}${placeLabel}${calendarLabel}`;
}

export function prettyJSON(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function formatMailOutput(raw: string, action: 'list' | 'search' | 'delete' | 'send', displayLimit?: number): string {
  const parsed = tryParseJSON(raw);
  if (!parsed) {
    return `메일 ${action}\n- 응답: ${raw.trim()}\n`;
  }
  if (action === 'delete' || action === 'send') {
    const ok = typeof parsed.ok === 'boolean' ? parsed.ok : true;
    const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint : '-';
    const status = typeof parsed.status === 'number' ? parsed.status : '-';
    return [`메일 ${action === 'delete' ? '삭제' : '발송'}`, `- 결과: ${ok ? '성공' : '실패'}`, `- 상태: ${status}`, `- endpoint: ${endpoint}`, ''].join('\n');
  }
  const items = extractArray(parsed);
  const total = items.length;
  const shown = typeof displayLimit === 'number' ? Math.min(displayLimit, total) : total;
  const lines = [`메일 ${action === 'list' ? '목록' : '검색'}`, `- 항목 수: ${total}`, `- 표시 수: ${shown}`];
  for (let i = 0; i < shown; i += 1) {
    lines.push(formatMailEntry(items[i], i + 1));
  }
  return `${lines.join('\n')}\n`;
}

export function formatCalendarOutput(raw: string): string {
  const parsed = tryParseJSON(raw);
  if (!parsed) return `캘린더 일정\n응답: ${raw.trim()}\n`;
  const items = extractArray(parsed);
  const total = items.length;
  const fromDate = typeof parsed.fromDate === 'string' ? parsed.fromDate : '-';
  const toDate = typeof parsed.toDate === 'string' ? parsed.toDate : '-';
  const calendars = Array.isArray(parsed.calendars) ? parsed.calendars.filter(isRecord) : [];
  const calendarNames = new Map<string, string>();
  for (const calendar of calendars) {
    const id = typeof calendar.id === 'number' || typeof calendar.id === 'string' ? String(calendar.id) : '';
    const name = cleanLabel(typeof calendar.name === 'string' ? calendar.name : '');
    if (id && name) calendarNames.set(id, name);
  }
  const lines = ['캘린더 일정', `기간: ${fromDate} ~ ${toDate}`, `항목 수: ${total}`];
  for (let i = 0; i < total; i += 1) {
    lines.push(formatCalendarEntry(items[i], i + 1, calendarNames));
  }
  return `${lines.join('\n')}\n`;
}

export function formatApprovalOutput(raw: string, action: 'todo' | 'reference' | 'count'): string {
  const parsed = tryParseJSON(raw);
  if (!parsed) return `결재 ${action}\n- 응답: ${raw.trim()}\n`;
  if (action === 'count') {
    const total = typeof parsed.total === 'number' ? parsed.total : typeof parsed.count === 'number' ? parsed.count : countItems(parsed);
    return [`결재 건수`, `- 건수: ${total}`, ''].join('\n');
  }
  const total = countItems(parsed);
  return [`결재 ${action === 'todo' ? '할일' : '참조'}`, `- 항목 수: ${total}`, ''].join('\n');
}

function getJsonVariables(raw: string): Record<string, unknown> | null {
  const parsed = tryParseJSON(raw);
  const variables = parsed?.data?.document?.variables ?? parsed?.document?.variables ?? parsed?.variables;
  return isRecord(variables) ? variables : null;
}

export function formatLeaveCountOutput(raw: string): string {
  const variables = getJsonVariables(raw);
  if (!variables) return `연차 정보\n- 응답: ${raw.trim()}\n`;
  const mapping: Array<[string, string]> = [
    ['usedPoint', '사용연차'],
    ['restPoint', '잔여연차'],
    ['additionPoint', '추가연차'],
    ['totalPoint', '총연차'],
  ];
  const lines = ['연차 정보'];
  for (const [key, label] of mapping) {
    if (key in variables) lines.push(`- ${label}: ${String(variables[key])}`);
  }
  lines.push('');
  return lines.join('\n');
}
