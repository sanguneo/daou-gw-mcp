import type { Config, Session } from './types.js';
import { requestText } from './http.js';

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

async function doApprovalGet(cfg: Config, session: Session, path: string): Promise<string> {
  const baseUrl = cfg.base_url?.trim() ?? '';
  if (!baseUrl) throw new Error('base url required');
  const url = `${trimBase(baseUrl)}${path}`;
  const { status, text } = await requestText(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${trimBase(baseUrl)}/app/approval/todo`,
    },
  }, session);
  if (status >= 400) {
    throw new Error(`http ${status}: ${text.trim()}`);
  }
  return text.trim();
}

function approvalQuery(page: number, size: number, searchType: string, keyword: string, duration: string, fromDate: string, toDate: string): string {
  const q = new URLSearchParams();
  q.set('page', String(page - 1));
  q.set('offset', String(size));
  q.set('property', 'document.isEmergency');
  q.set('direction', 'desc');
  q.set('searchtype', searchType);
  q.set('keyword', keyword);
  if (duration.trim()) q.set('duration', duration);
  if (fromDate.trim()) q.set('fromDate', fromDate);
  if (toDate.trim()) q.set('toDate', toDate);
  return q.toString();
}

export async function approvalTodo(cfg: Config, session: Session, listType: string, page: number, size: number, searchType: string, keyword: string, duration: string, fromDate: string, toDate: string): Promise<string> {
  const kind = listType.trim().toLowerCase();
  if (!['all', 'wait', 'hold', 'reference', 'read', 'view'].includes(kind)) {
    throw new Error('approval type는 all|wait|hold, reference kind는 reference|read|view');
  }
  const query = approvalQuery(page, size, searchType, keyword, duration, fromDate, toDate);
  return doApprovalGet(cfg, session, `/api/approval/todo/${kind}?${query}`);
}

export async function approvalReference(cfg: Config, session: Session, kind: string, page: number, size: number, searchType: string, keyword: string, duration: string, fromDate: string, toDate: string): Promise<string> {
  const refKind = kind.trim().toLowerCase();
  if (!['reference', 'read', 'view'].includes(refKind)) {
    throw new Error('approval reference kind는 reference|read|view');
  }
  const query = approvalQuery(page, size, searchType, keyword, duration, fromDate, toDate);
  return doApprovalGet(cfg, session, `/api/approval/todo/${refKind}?${query}`);
}

export async function approvalCount(cfg: Config, session: Session): Promise<string> {
  return doApprovalGet(cfg, session, '/api/approval/todo/count');
}
