import { z } from 'zod';
import { fetchDirectory, fetchOrgTree, searchEmployees, type Employee } from '../api/organization.js';
import { defineOperation } from '../core/registry.js';
import { cacheAgeHours, loadDirectoryCache, saveDirectoryCache } from '../core/storage.js';
import { requireSession } from '../core/context.js';
import { formatEmployees, formatOrgTree } from '../render/organization.js';

const CACHE_TTL_HOURS = 24;

/**
 * Reuse the cached directory unless it is stale or a refresh was requested.
 * A session is only established when the directory actually has to be fetched,
 * so searching a fresh cache works without touching the network.
 */
async function directory(refresh: boolean): Promise<{ employees: Employee[]; ageHours?: number }> {
  if (!refresh) {
    const cached = await loadDirectoryCache<Employee>();
    if (cached && cached.entries.length > 0) {
      const ageHours = cacheAgeHours(cached);
      if (ageHours < CACHE_TTL_HOURS) return { employees: cached.entries, ageHours };
    }
  }
  const live = await requireSession();
  const employees = await fetchDirectory(live.baseUrl(), live.session);
  await saveDirectoryCache(employees);
  return { employees, ageHours: 0 };
}

export const orgTree = defineOperation({
  id: 'org.tree',
  tool: 'org_tree',
  cli: ['org', 'tree'],
  summary: 'Show the organization chart',
  input: z.strictObject({
    members: z.boolean().optional().describe('Include people under each department'),
  }),
  auth: true,
  run: async (ctx, input) => {
    const nodes = await fetchOrgTree(ctx.baseUrl(), ctx.session);
    return { data: nodes, text: formatOrgTree(nodes, input.members === true) };
  },
});

export const orgSearch = defineOperation({
  id: 'org.search',
  tool: 'org_search',
  cli: ['org', 'search'],
  summary: 'Search the employee directory by name, department, position, email or phone',
  input: z.strictObject({
    query: z.string().optional().describe('Free-text match; omit to list everyone'),
    limit: z.number().int().min(1).default(20).describe('Maximum results'),
    refresh: z.boolean().optional().describe('Re-fetch the directory instead of using the local cache'),
  }),
  run: async (_ctx, input) => {
    const { employees, ageHours } = await directory(input.refresh === true);
    const matched = searchEmployees(employees, input.query ?? '');
    const shown = matched.slice(0, input.limit);
    return {
      data: { total: employees.length, matched: matched.length, employees: shown },
      text: formatEmployees(shown, employees.length, ageHours),
    };
  },
});

export const orgOperations = [orgTree, orgSearch];
