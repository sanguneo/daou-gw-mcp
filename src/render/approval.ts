import type { ApprovalForm, ApprovalFormNode } from '../api/approval.js';
import { formatStamp } from '../core/time.js';
import { countItems, isRecord, lines, tryParseJson } from './common.js';

function renderFormNode(node: ApprovalFormNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  out.push(node.rel === 'FORM'
    ? `${indent}- ${node.title} (form ${node.nodeId})`
    : `${indent}+ ${node.title}`);
  for (const child of node.children) renderFormNode(child, depth + 1, out);
}

export function formatFormTree(nodes: ApprovalFormNode[]): string {
  if (nodes.length === 0) return lines('결재 양식', '- 양식이 없습니다.');
  const out: string[] = ['결재 양식'];
  for (const node of nodes) renderFormNode(node, 0, out);
  return lines(...out);
}

export function formatFormSearch(forms: ApprovalForm[], total: number): string {
  return lines(
    '결재 양식 검색',
    `- 전체: ${total}개 / 결과: ${forms.length}개`,
    ...(forms.length === 0
      ? ['- 일치하는 양식이 없습니다.']
      : forms.map((form, index) => {
          const path = form.folderPath.length > 0 ? `${form.folderPath.join(' > ')} > ` : '';
          return `${index + 1}. ${path}${form.title} (form ${form.formId})`;
        })),
  );
}

export function formatDraftSaved(raw: string, formId: number, deptId: number): string {
  const parsed = tryParseJson(raw);
  const document = parsed?.data?.document;
  return lines(
    '임시저장 완료',
    `- 문서 ID: ${document?.id ?? '-'}`,
    `- 제목: ${document?.title ?? '-'}`,
    `- 양식: ${document?.formName ?? '-'} (form ${formId})`,
    `- 기안부서: ${deptId}`,
    `- 상태: ${document?.docStatusName ?? document?.docStatus ?? '-'}`,
    '- 상신은 하지 않았습니다. 그룹웨어 임시저장함에서 이어서 작성하세요.',
  );
}

export function formatDocumentBox(raw: string, label: string): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return lines(label, `- 응답: ${raw.trim()}`);
  const items: any[] = Array.isArray(parsed.data) ? parsed.data : [];
  const total = parsed?.page?.total ?? items.length;

  return lines(
    label,
    `- 전체: ${total}건 / 표시: ${items.length}건`,
    ...(items.length === 0
      ? ['- 문서가 없습니다.']
      : items.map((item, index) => {
          const when = formatStamp(item.draftedAt ?? item.updatedAt ?? item.createdAt);
          const drafter = item.drafterName ? ` | ${item.drafterName}` : '';
          const status = item.docStatusName ?? item.docStatus ?? '-';
          return `${index + 1}. [${status}] ${when}${drafter} | ${item.title || item.formName || '(제목 없음)'} (id: ${item.documentId ?? item.id ?? '-'})`;
        })),
  );
}

export function formatDocument(raw: string): string {
  const parsed = tryParseJson(raw);
  const document = parsed?.data?.document;
  if (!document) return lines('결재 문서', `- 응답: ${raw.trim()}`);
  return lines(
    '결재 문서',
    `- 문서 ID: ${document.id ?? '-'}`,
    `- 제목: ${document.title || document.formName || '-'}`,
    `- 양식: ${document.formName ?? '-'}`,
    `- 상태: ${document.docStatusName ?? document.docStatus ?? '-'}`,
    `- 기안자: ${document.drafterName ?? '-'} (${document.drafterDeptName ?? '-'})`,
    `- 문서번호: ${document.docNum || '-'}`,
  );
}

export function formatApprovalList(raw: string, action: 'todo' | 'reference'): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return lines(`결재 ${action}`, `- 응답: ${raw.trim()}`);
  return lines(`결재 ${action === 'todo' ? '할일' : '참조'}`, `- 항목 수: ${countItems(parsed)}`);
}

export function formatApprovalCount(raw: string): string {
  const parsed = tryParseJson(raw);
  if (!parsed) return lines('결재 건수', `- 응답: ${raw.trim()}`);
  const total = typeof parsed.total === 'number'
    ? parsed.total
    : typeof parsed.count === 'number'
      ? parsed.count
      : countItems(parsed);
  return lines('결재 건수', `- 건수: ${total}`);
}

const LEAVE_LABELS: Array<[string, string]> = [
  ['usedPoint', '사용연차'],
  ['restPoint', '잔여연차'],
  ['additionPoint', '추가연차'],
  ['totalPoint', '총연차'],
];

/** The leave balance is buried in the blank-form document variables. */
export function leaveVariables(raw: string): Record<string, unknown> | null {
  const parsed = tryParseJson(raw);
  const variables = parsed?.data?.document?.variables ?? parsed?.document?.variables ?? parsed?.variables;
  return isRecord(variables) ? variables : null;
}

export function formatLeaveCount(raw: string): string {
  const variables = leaveVariables(raw);
  if (!variables) return lines('연차 정보', `- 응답: ${raw.trim()}`);
  return lines(
    '연차 정보',
    ...LEAVE_LABELS.filter(([key]) => key in variables).map(([key, label]) => `- ${label}: ${String(variables[key])}`),
  );
}
