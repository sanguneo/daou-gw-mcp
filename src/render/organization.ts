import { isDepartment, type Employee, type OrgNode } from '../api/organization.js';
import { lines } from './common.js';

function renderNode(node: OrgNode, depth: number, out: string[], withMembers: boolean): void {
  const indent = '  '.repeat(depth);
  if (isDepartment(node)) {
    out.push(`${indent}+ ${node.title} (#${node.nodeId})`);
  } else {
    if (!withMembers) return;
    out.push(`${indent}- ${node.title}`);
  }
  for (const child of node.children) renderNode(child, depth + 1, out, withMembers);
}

export function formatOrgTree(nodes: OrgNode[], withMembers: boolean): string {
  if (nodes.length === 0) return lines('조직도', '- 조회된 조직이 없습니다.');
  const out: string[] = ['조직도'];
  for (const node of nodes) renderNode(node, 0, out, withMembers);
  return lines(...out);
}

function employeeLine(employee: Employee, index: number): string {
  const parts = [employee.name];
  if (employee.position) parts.push(employee.position);
  if (employee.departments.length > 0) parts.push(employee.departments.join('/'));
  const contact = [employee.email, employee.mobileNo, employee.directTel].filter(Boolean).join(' | ');
  return `${index}. ${parts.join(' · ')}${contact ? ` — ${contact}` : ''} (id: ${employee.id})`;
}

export function formatEmployees(employees: Employee[], total: number, cachedAtHours?: number): string {
  const header = ['직원 검색', `- 전체: ${total}명`, `- 결과: ${employees.length}명`];
  if (cachedAtHours !== undefined) {
    header.push(`- 캐시: ${cachedAtHours < 1 ? '방금' : `${Math.floor(cachedAtHours)}시간 전`} 갱신`);
  }
  if (employees.length === 0) header.push('- 일치하는 직원이 없습니다.');
  return lines(...header, ...employees.map((employee, index) => employeeLine(employee, index + 1)));
}
