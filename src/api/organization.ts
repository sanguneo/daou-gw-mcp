import { requestJson, requestText, trimBaseUrl } from '../core/http.js';
import type { Session } from '../core/types.js';

export interface OrgNode {
  id: string;
  title: string;
  /** `company`, `org`, ... as reported by the groupware. */
  rel: string;
  nodeId: number;
  children: OrgNode[];
}

export interface Employee {
  id: number;
  name: string;
  email?: string;
  position?: string;
  employeeNumber?: string;
  directTel?: string;
  mobileNo?: string;
  companyName?: string;
  departments: string[];
  manager: boolean;
}

interface RawTreeNode {
  data?: { id?: string; title?: string; attr?: { id?: string; title?: string; rel?: string; nodeId?: number } };
  metadata?: { id?: number; name?: string };
  children?: RawTreeNode[];
}

/** Department-like nodes; anything else in the tree is a person. */
const DEPARTMENT_RELS = new Set(['company', 'org', 'dept']);

function toOrgNode(raw: RawTreeNode): OrgNode | null {
  const attr = raw?.data?.attr;
  if (!attr) return null;
  return {
    id: String(attr.id ?? ''),
    title: String(attr.title ?? raw.data?.title ?? ''),
    rel: String(attr.rel ?? ''),
    nodeId: Number(attr.nodeId ?? 0),
    children: (raw.children ?? []).map(toOrgNode).filter((node): node is OrgNode => node !== null),
  };
}

async function fetchTree(baseUrl: string, session: Session, path: string): Promise<RawTreeNode[]> {
  const root = trimBaseUrl(baseUrl);
  const { status, text } = await requestText(`${root}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${root}/app/organization` },
  }, session);
  if (status >= 400) throw new Error(`organization http ${status}`);
  const parsed = JSON.parse(text) as RawTreeNode[];
  return Array.isArray(parsed) ? parsed : [];
}

/**
 * The organization chart. `/api/organization/list` carries the members of each
 * department, unlike `/api/organization/dept` which only returns bare folders.
 */
export async function fetchOrgTree(baseUrl: string, session: Session): Promise<OrgNode[]> {
  const raw = await fetchTree(baseUrl, session, '/api/organization/list?type=mydept');
  return raw.map(toOrgNode).filter((node): node is OrgNode => node !== null);
}

export function isDepartment(node: OrgNode): boolean {
  return DEPARTMENT_RELS.has(node.rel);
}

/**
 * Find the department a user sits in by walking the org tree.
 * Approval drafting needs this id and the groupware offers no direct lookup.
 */
export async function resolveDeptId(baseUrl: string, session: Session, userId: number): Promise<number | undefined> {
  const raw = await fetchTree(baseUrl, session, '/api/organization/list?type=mydept');

  const walk = (nodes: RawTreeNode[], deptId: number | undefined): number | undefined => {
    for (const node of nodes) {
      const attr = node?.data?.attr;
      const rel = String(attr?.rel ?? '');
      const nodeId = Number(attr?.nodeId ?? 0);
      if (!DEPARTMENT_RELS.has(rel) && Number(node.metadata?.id) === userId) return deptId;
      const nextDept = DEPARTMENT_RELS.has(rel) && nodeId > 0 ? nodeId : deptId;
      const found = walk(node.children ?? [], nextDept);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  return walk(raw, undefined);
}

function departmentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>;
        const name = record.name ?? record.deptName ?? record.title;
        return typeof name === 'string' ? name : '';
      }
      return '';
    })
    .filter((name): name is string => name.length > 0);
}

function toEmployee(raw: Record<string, unknown>): Employee | null {
  const id = Number(raw.id);
  const name = typeof raw.name === 'string' ? raw.name : '';
  if (!Number.isFinite(id) || !name) return null;
  const text = (key: string): string | undefined => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  return {
    id,
    name,
    email: text('email') ?? text('originalEmail'),
    position: text('position'),
    employeeNumber: text('employeeNumber'),
    directTel: text('directTel'),
    mobileNo: text('mobileNo'),
    companyName: text('companyName'),
    departments: departmentNames(raw.departments),
    manager: raw.manager === true,
  };
}

interface UserSearchPage {
  page?: { page?: number; totalPage?: number; total?: number };
  hasNext?: boolean;
  data?: unknown;
}

/**
 * Pull the whole employee directory.
 *
 * The endpoint ignores its search parameters and always returns the full list,
 * so the directory is fetched once and searched locally.
 */
export async function fetchDirectory(baseUrl: string, session: Session, pageSize = 100): Promise<Employee[]> {
  const root = trimBaseUrl(baseUrl);
  const employees: Employee[] = [];
  const seen = new Set<number>();

  for (let page = 0; page < 100; page += 1) {
    const url = `${root}/api/user/search?searchWord=&page=${page}&offset=${pageSize}`;
    const { status, data } = await requestJson<UserSearchPage>(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: `${root}/app/organization` },
    }, session);
    if (status >= 400) throw new Error(`directory http ${status}`);

    const list = Array.isArray(data.data) ? data.data : [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const employee = toEmployee(item as Record<string, unknown>);
      if (employee && !seen.has(employee.id)) {
        seen.add(employee.id);
        employees.push(employee);
      }
    }

    const totalPage = data.page?.totalPage ?? 0;
    if (list.length === 0 || data.hasNext === false || (totalPage > 0 && page + 1 >= totalPage)) break;
  }

  return employees;
}

/** Case-insensitive match across every human-meaningful field. */
export function searchEmployees(employees: Employee[], query: string): Employee[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return employees;
  return employees.filter((employee) => [
    employee.name,
    employee.email,
    employee.position,
    employee.employeeNumber,
    employee.directTel,
    employee.mobileNo,
    employee.companyName,
    ...employee.departments,
  ].some((field) => field?.toLowerCase().includes(needle)));
}
