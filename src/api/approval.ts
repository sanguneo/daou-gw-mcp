import { requestText, trimBaseUrl } from '../core/http.js';
import type { Session } from '../core/types.js';

export interface ApprovalFormNode {
  id: string;
  nodeId: number;
  title: string;
  /** `FOLDER` for a category, `FORM` for a usable document form. */
  rel: string;
  children: ApprovalFormNode[];
}

export interface ApprovalForm {
  formId: number;
  title: string;
  /** Folder names from the root down to this form. */
  folderPath: string[];
}

export const APPROVAL_TODO_KINDS = ['all', 'wait', 'hold'] as const;
export const APPROVAL_REFERENCE_KINDS = ['reference', 'read', 'view'] as const;

export type ApprovalTodoKind = (typeof APPROVAL_TODO_KINDS)[number];
export type ApprovalReferenceKind = (typeof APPROVAL_REFERENCE_KINDS)[number];

export interface ApprovalListQuery {
  page: number;
  size: number;
  searchtype?: string;
  keyword?: string;
  duration?: string;
  fromDate?: string;
  toDate?: string;
}

async function approvalGet(baseUrl: string, session: Session, path: string): Promise<string> {
  const root = trimBaseUrl(baseUrl);
  const { status, text } = await requestText(`${root}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${root}/app/approval/todo`,
    },
  }, session);
  if (status >= 400) throw new Error(`http ${status}: ${text.trim()}`);
  return text.trim();
}

/** The API is zero-indexed and calls the page size `offset`. */
function approvalQuery(query: ApprovalListQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(query.page - 1));
  params.set('offset', String(query.size));
  params.set('property', 'document.isEmergency');
  params.set('direction', 'desc');
  params.set('searchtype', query.searchtype ?? '');
  params.set('keyword', query.keyword ?? '');
  if (query.duration?.trim()) params.set('duration', query.duration);
  if (query.fromDate?.trim()) params.set('fromDate', query.fromDate);
  if (query.toDate?.trim()) params.set('toDate', query.toDate);
  return params.toString();
}

export async function approvalList(
  baseUrl: string,
  session: Session,
  kind: ApprovalTodoKind | ApprovalReferenceKind,
  query: ApprovalListQuery,
): Promise<string> {
  return approvalGet(baseUrl, session, `/api/approval/todo/${kind}?${approvalQuery(query)}`);
}

export async function approvalCount(baseUrl: string, session: Session): Promise<string> {
  return approvalGet(baseUrl, session, '/api/approval/todo/count');
}

interface RawFormNode {
  attr?: { id?: string; title?: string; rel?: string; nodeId?: number };
  data?: { attr?: { id?: string; title?: string; rel?: string; nodeId?: number } };
}

function toFormNode(raw: RawFormNode): ApprovalFormNode | null {
  const attr = raw?.attr ?? raw?.data?.attr;
  if (!attr?.id) return null;
  return {
    id: String(attr.id),
    nodeId: Number(attr.nodeId ?? 0),
    title: String(attr.title ?? ''),
    rel: String(attr.rel ?? ''),
    children: [],
  };
}

/** One level of the approval form tree; omit `folderId` for the root. */
export async function fetchFormTree(baseUrl: string, session: Session, folderId?: number): Promise<ApprovalFormNode[]> {
  const query = folderId === undefined ? '' : `?folderId=${folderId}`;
  const raw = await approvalGet(baseUrl, session, `/api/approval/apprform/tree${query}`);
  const parsed = JSON.parse(raw) as RawFormNode[];
  return (Array.isArray(parsed) ? parsed : []).map(toFormNode).filter((node): node is ApprovalFormNode => node !== null);
}

const MAX_FOLDER_FETCHES = 60;

/** The whole form tree, expanding every folder. */
export async function fetchFormTreeDeep(baseUrl: string, session: Session): Promise<ApprovalFormNode[]> {
  const root = await fetchFormTree(baseUrl, session);
  let fetches = 0;

  const expand = async (nodes: ApprovalFormNode[]): Promise<void> => {
    for (const node of nodes) {
      if (node.rel !== 'FOLDER' || fetches >= MAX_FOLDER_FETCHES) continue;
      fetches += 1;
      node.children = await fetchFormTree(baseUrl, session, node.nodeId);
      await expand(node.children);
    }
  };

  await expand(root);
  return root;
}

export function flattenForms(nodes: ApprovalFormNode[], trail: string[] = []): ApprovalForm[] {
  const forms: ApprovalForm[] = [];
  for (const node of nodes) {
    if (node.rel === 'FORM') {
      forms.push({ formId: node.nodeId, title: node.title, folderPath: trail });
      continue;
    }
    forms.push(...flattenForms(node.children, [...trail, node.title]));
  }
  return forms;
}

export interface BlankDocument {
  id: number;
  document: Record<string, unknown>;
  docInfo: Record<string, unknown>;
  apprFlow: Record<string, unknown>;
}

/**
 * Allocate a blank document for a form. The groupware assigns a document id
 * here; nothing is filed until it is saved.
 */
export async function documentNew(baseUrl: string, session: Session, formId: number, deptId: number): Promise<BlankDocument> {
  const raw = await approvalGet(baseUrl, session, `/api/approval/document/new?formId=${formId}&deptId=${deptId}`);
  const data = (JSON.parse(raw) as { data?: Record<string, unknown> }).data;
  if (!data || typeof data.id !== 'number') throw new Error('approval document/new returned no document');
  return {
    id: data.id,
    document: (data.document ?? {}) as Record<string, unknown>,
    docInfo: (data.docInfo ?? {}) as Record<string, unknown>,
    apprFlow: (data.apprFlow ?? {}) as Record<string, unknown>,
  };
}

/**
 * The web client does not echo `docInfo` back verbatim: it collapses folders to
 * bare ids and sends the scalar fields as strings. Posting the raw
 * `document/new` shape is accepted but leaves the document unfiled, so it never
 * shows up in the 임시문서함.
 */
function normalizeDocInfo(id: number, source: Record<string, unknown>): Record<string, unknown> {
  const folders = Array.isArray(source.docFolders) ? source.docFolders : [];
  return {
    id,
    securityLevelId: String(source.securityLevelId ?? ''),
    docYear: String(source.docYear ?? ''),
    docFolders: folders
      .map((folder) => (folder && typeof folder === 'object' ? (folder as Record<string, unknown>).id : undefined))
      .filter((folderId) => folderId !== undefined && folderId !== null)
      .map((folderId) => ({ id: String(folderId) })),
    docReceptionReaders: source.docReceptionReaders ?? [],
    docReferenceReaders: source.docReferenceReaders ?? [],
    docReadingReaders: source.docReadingReaders ?? [],
    officialVersions: source.officialVersions ?? [],
    isPublic: String(source.isPublic ?? false),
    isEmergency: source.isEmergency ?? false,
    drafterDeptFolderId: source.drafterDeptFolderId ?? '',
  };
}

export interface TempSaveOverrides {
  title?: string;
  content?: string;
  variables?: Record<string, unknown>;
}

/**
 * Save a document to the 임시저장함.
 *
 * This is deliberately the end of the line: nothing here submits a document
 * for approval.
 */
export async function documentTempSave(
  baseUrl: string,
  session: Session,
  blank: BlankDocument,
  formId: number,
  deptId: number,
  overrides: TempSaveOverrides = {},
): Promise<string> {
  const root = trimBaseUrl(baseUrl);
  const source = blank.document;
  const payload = {
    document: {
      id: blank.id,
      documentId: blank.id,
      attachCount: source.attachCount ?? 0,
      attaches: source.attaches ?? [],
      comments: source.comments ?? [],
      references: source.references ?? [],
      docBodyContent: overrides.content ?? source.docBodyContent ?? '',
      title: overrides.title ?? source.formName ?? '',
      variables: { ...(source.variables as Record<string, unknown> ?? {}), ...(overrides.variables ?? {}) },
      reDraft: source.reDraft ?? false,
      updatedAt: source.updatedAt,
    },
    docInfo: normalizeDocInfo(blank.id, blank.docInfo),
    apprFlow: blank.apprFlow,
  };

  const { status, text } = await requestText(`${root}/api/approval/document/${blank.id}/tempsave`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: root,
      Referer: `${root}/app/approval/document/new/${deptId}/${formId}`,
    },
  }, session);
  if (status >= 400) throw new Error(`tempsave http ${status}: ${text.trim()}`);
  return text.trim();
}

export const DOCUMENT_BOXES = {
  draft: { path: '/api/approval/doclist/draft/all', property: 'draftedAt', dateRange: true, label: '기안문서' },
  tempsave: { path: '/api/approval/doclist/tempsave/all', property: 'updatedAt', dateRange: false, label: '임시문서' },
  approve: { path: '/api/approval/doclist/approve/all', property: 'draftedAt', dateRange: true, label: '결재문서' },
  viewer: { path: '/api/approval/doclist/viewer/all', property: 'document.draftedAt', dateRange: true, label: '참조/열람문서' },
  reception: { path: '/api/approval/doclist/reception/waiting', property: 'receivedAt', dateRange: false, label: '수신문서' },
  send: { path: '/api/approval/doclist/send/all', property: 'createdAt', dateRange: true, label: '발송문서' },
  official: { path: '/api/approval/doclist/userofficial/all', property: 'document.completedAt', dateRange: true, label: '공문문서' },
} as const;

export type DocumentBoxKind = keyof typeof DOCUMENT_BOXES;
export const DOCUMENT_BOX_KINDS = Object.keys(DOCUMENT_BOXES) as [DocumentBoxKind, ...DocumentBoxKind[]];

export interface DocumentBoxQuery {
  page: number;
  size: number;
  searchtype?: string;
  keyword?: string;
  fromDate?: string;
  toDate?: string;
  duration?: string;
}

/** One of the approval document boxes shown in the groupware sidebar. */
export async function fetchDocumentBox(
  baseUrl: string,
  session: Session,
  kind: DocumentBoxKind,
  query: DocumentBoxQuery,
): Promise<string> {
  const box = DOCUMENT_BOXES[kind];
  const params = new URLSearchParams();
  params.set('page', String(query.page - 1));
  params.set('offset', String(query.size));
  params.set('property', box.property);
  params.set('direction', 'desc');
  params.set('searchtype', query.searchtype ?? '');
  params.set('keyword', query.keyword ?? '');
  if (box.dateRange) {
    params.set('fromDate', query.fromDate ?? '');
    params.set('toDate', query.toDate ?? '');
    params.set('duration', query.duration ?? 'all');
  }
  return approvalGet(baseUrl, session, `${box.path}?${params.toString()}`);
}

/** Fetch a single approval document, including saved drafts. */
export async function approvalDocument(baseUrl: string, session: Session, documentId: number): Promise<string> {
  return approvalGet(baseUrl, session, `/api/approval/document/${documentId}`);
}

/** Annual leave balance lives in the variables of a blank leave request form. */
export async function approvalLeaveCount(baseUrl: string, session: Session, formId: number, deptId: number): Promise<string> {
  if (!Number.isInteger(formId) || formId <= 0) throw new Error('invalid formId');
  if (!Number.isInteger(deptId) || deptId <= 0) throw new Error('invalid deptId');
  return approvalGet(baseUrl, session, `/api/approval/document/new?formId=${formId}&deptId=${deptId}`);
}
