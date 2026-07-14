#!/usr/bin/env node
import {
  approvalCount,
  approvalLeaveCount,
  approvalReference,
  approvalTodo,
  attendanceStatus,
  boardPostCreate,
  boardPostUpdate,
  clockInAttendance,
  clockOutAttendance,
  deleteMail,
  formatApprovalOutput,
  formatAttendanceStatus,
  formatCalendarOutput,
  formatConfig,
  formatLeaveCountOutput,
  formatMailOutput,
  formatSession,
  listCalendarEvents,
  listMail,
  loadConfig,
  loadSession,
  login,
  mergeConfig,
  resolveBaseUrl,
  resolveSession,
  saveConfig,
  saveSession,
  searchMail,
  validateSession
} from "./chunk-O5ES5E47.js";

// src/mcp.ts
import * as readline from "readline";
function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function fail(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function str(v) {
  return typeof v === "string" ? v : "";
}
function textArg(v) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}
function optionalTextArg(v) {
  if (v === void 0) return void 0;
  return textArg(v);
}
function optionalPositiveIntArg(v, fallback) {
  if (v === void 0) return fallback;
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}
function stringArrayArg(v) {
  if (v === void 0) return [];
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const item of v) {
    if (typeof item !== "string") return null;
    const trimmed = item.trim();
    if (!trimmed) return null;
    out.push(trimmed);
  }
  return out;
}
function noArgs(args) {
  return Object.keys(args).length === 0;
}
function normalizeToolName(name) {
  if (name === "attendance_status") return "attend_status";
  if (name === "attendance_in") return "attend_in";
  if (name === "attendance_out") return "attend_out";
  return name;
}
var TOOL_ALLOWED_KEYS = {
  config_show: [],
  config_set: ["base_url", "username", "password", "attend", "mail_list_url", "mail_search_url", "mail_delete_url", "board_create_url", "board_update_url", "board_attach_url"],
  login: ["username", "password", "base_url"],
  session: [],
  attend_status: [],
  attend_in: [],
  attend_out: [],
  mail_list: ["folder", "page", "size"],
  mail_search: ["folder", "query", "page", "size"],
  mail_delete: ["folder", "ids", "id"],
  calendar_list: ["calendar_id", "from_date", "to_date"],
  approval_todo: ["type", "page", "size", "searchtype", "keyword", "duration", "from_date", "to_date"],
  approval_reference: ["kind", "page", "size", "searchtype", "keyword", "duration", "from_date", "to_date"],
  approval_count: [],
  leave_count: [],
  board_post_create: ["board_id", "subject", "content"],
  board_post_update: ["board_id", "post_id", "subject", "content"]
};
function isPlainObject(v) {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
function validateToolArgs(name, raw) {
  if (raw === void 0) {
    return { ok: true, args: {} };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: "invalid arguments" };
  }
  const allowed = TOOL_ALLOWED_KEYS[normalizeToolName(name)];
  if (!allowed) {
    return { ok: true, args: raw };
  }
  const unexpected = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    return { ok: false, error: "unexpected arguments" };
  }
  return { ok: true, args: raw };
}
function tool(name, description, properties = {}, required = [], extra = {}) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
      ...extra
    }
  };
}
function coreTools() {
  return [
    tool("config_show", "Show local daou-gw config"),
    tool(
      "config_set",
      "Update local daou-gw config in ~/.daou/config.json",
      { base_url: { type: "string" }, username: { type: "string" }, password: { type: "string" }, attend: { type: "boolean" }, mail_list_url: { type: "string" }, mail_search_url: { type: "string" }, mail_delete_url: { type: "string" }, board_create_url: { type: "string" }, board_update_url: { type: "string" }, board_attach_url: { type: "string" } }
    ),
    tool(
      "login",
      "Login and save session cookies",
      { username: { type: "string", minLength: 1 }, password: { type: "string", minLength: 1 }, base_url: { type: "string" } },
      ["username", "password"]
    ),
    tool("session", "Validate saved session"),
    tool(
      "mail_list",
      "List mail over HTTP using saved session",
      { folder: { type: "string" }, page: { type: "integer" }, size: { type: "integer" } },
      []
    ),
    tool(
      "mail_search",
      "Search mail over HTTP using saved session",
      { folder: { type: "string" }, query: { type: "string", minLength: 1 }, page: { type: "integer" }, size: { type: "integer" } },
      ["query"]
    ),
    tool(
      "mail_delete",
      "Delete mail over HTTP using saved session",
      { folder: { type: "string" }, ids: { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 }, id: { type: "string", minLength: 1 } },
      [],
      { anyOf: [{ required: ["ids"] }, { required: ["id"] }] }
    ),
    tool(
      "calendar_list",
      "List calendar events over HTTP using saved session; when calendar_id is omitted, use all calendar ids from /api/calendar/user/{userId}/calendar",
      { calendar_id: { type: "integer" }, from_date: { type: "string" }, to_date: { type: "string" } }
    ),
    tool(
      "approval_todo",
      "List approval todo items over HTTP using saved session",
      { type: { type: "string" }, page: { type: "integer" }, size: { type: "integer" }, searchtype: { type: "string" }, keyword: { type: "string" }, duration: { type: "string" }, from_date: { type: "string" }, to_date: { type: "string" } }
    ),
    tool(
      "approval_reference",
      "List approval reference/read/view items over HTTP using saved session",
      { kind: { type: "string" }, page: { type: "integer" }, size: { type: "integer" }, searchtype: { type: "string" }, keyword: { type: "string" }, duration: { type: "string" }, from_date: { type: "string" }, to_date: { type: "string" } }
    ),
    tool("approval_count", "Get approval todo count over HTTP using saved session"),
    tool("leave_count", "Show annual leave usage, balance, extra, and total points"),
    tool(
      "board_post_create",
      "Create board post over HTTP",
      { board_id: { type: "integer" }, subject: { type: "string", minLength: 1 }, content: { type: "string", minLength: 1 } },
      ["board_id", "subject", "content"]
    ),
    tool(
      "board_post_update",
      "Update board post over HTTP",
      { board_id: { type: "integer" }, post_id: { type: "integer" }, subject: { type: "string", minLength: 1 }, content: { type: "string", minLength: 1 } },
      ["board_id", "post_id", "subject", "content"]
    )
  ];
}
function attendTools() {
  return [
    tool("attend_status", "Check attendance state"),
    tool("attend_in", "Clock in using saved session"),
    tool("attend_out", "Clock out using saved session")
  ];
}
async function toolsList() {
  const cfg = await loadConfig();
  return cfg.attend ? [...coreTools(), ...attendTools()] : coreTools();
}
async function callTool(name, args = {}) {
  const toolName = normalizeToolName(name);
  if (toolName === "config_show") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    return { text: formatConfig(await loadConfig()), isError: false };
  }
  if (toolName === "config_set") {
    const stored = await loadConfig();
    const next = mergeConfig(stored, {
      base_url: str(args.base_url) || stored.base_url,
      username: str(args.username) || stored.username,
      password: str(args.password) || stored.password,
      attend: typeof args.attend === "boolean" ? args.attend : stored.attend,
      mail_list_url: str(args.mail_list_url) || stored.mail_list_url,
      mail_search_url: str(args.mail_search_url) || stored.mail_search_url,
      mail_delete_url: str(args.mail_delete_url) || stored.mail_delete_url,
      board_create_url: str(args.board_create_url) || stored.board_create_url,
      board_update_url: str(args.board_update_url) || stored.board_update_url,
      board_attach_url: str(args.board_attach_url) || stored.board_attach_url
    });
    await saveConfig(next);
    return { text: formatConfig(next), isError: false };
  }
  if (toolName === "login") {
    const username = str(args.username);
    const password = str(args.password);
    if (!username || !password) return { text: "missing username/password", isError: true };
    const stored = await loadConfig();
    const cfg = mergeConfig(stored, { username, password, base_url: str(args.base_url) || stored.base_url });
    const baseUrl = str(args.base_url).trim() || stored.base_url?.trim();
    if (!baseUrl) return { text: "base url required", isError: true };
    const sess = await login(baseUrl, username, password);
    await saveConfig({ ...cfg });
    await saveSession(sess);
    return { text: formatSession(sess), isError: false };
  }
  if (toolName === "session") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    const cfg = await loadConfig();
    const sess = await loadSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const valid = await validateSession(baseUrl, sess);
    return { text: formatSession({ ...sess, last_check: valid ? "valid" : "invalid" }), isError: false };
  }
  if (toolName === "attend_status") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    if (!(await loadConfig()).attend) return { text: "unknown tool", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    return { text: formatAttendanceStatus(await attendanceStatus(baseUrl, sess)), isError: false };
  }
  if (toolName === "attend_in") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    if (!(await loadConfig()).attend) return { text: "unknown tool", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    return { text: `${(await clockInAttendance(baseUrl, sess)).status}
`, isError: false };
  }
  if (toolName === "attend_out") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    if (!(await loadConfig()).attend) return { text: "unknown tool", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    return { text: `${(await clockOutAttendance(baseUrl, sess)).status}
`, isError: false };
  }
  if (toolName === "mail_list") {
    const folder = optionalTextArg(args.folder);
    const page = optionalPositiveIntArg(args.page, 1);
    const size = optionalPositiveIntArg(args.size, 20);
    if (folder === null || page === null || size === null) return { text: "invalid mail_list args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await listMail({ ...cfg, base_url: baseUrl }, sess, folder ?? "Inbox", page, size);
    return { text: formatMailOutput(raw, "list", size), isError: false };
  }
  if (toolName === "mail_search") {
    const folder = optionalTextArg(args.folder);
    const query = textArg(args.query);
    const page = optionalPositiveIntArg(args.page, 1);
    const size = optionalPositiveIntArg(args.size, 20);
    if (folder === null || query === null || page === null || size === null) return { text: "invalid mail_search args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await searchMail({ ...cfg, base_url: baseUrl }, sess, folder ?? "Inbox", query, page, size);
    return { text: formatMailOutput(raw, "search", size), isError: false };
  }
  if (toolName === "mail_delete") {
    const folder = optionalTextArg(args.folder);
    const ids = stringArrayArg(args.ids);
    const id = optionalTextArg(args.id);
    if (folder === null || ids === null || id === null) return { text: "invalid mail_delete args", isError: true };
    const uniqueIds = Array.from(/* @__PURE__ */ new Set([...ids, ...id ? [id] : []]));
    if (uniqueIds.length === 0) return { text: "missing ids", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await deleteMail({ ...cfg, base_url: baseUrl }, sess, uniqueIds, folder ?? "Inbox");
    return { text: formatMailOutput(raw, "delete"), isError: false };
  }
  if (toolName === "calendar_list") {
    const calendarId = args.calendar_id === void 0 ? void 0 : typeof args.calendar_id === "number" && Number.isInteger(args.calendar_id) && args.calendar_id > 0 ? String(args.calendar_id) : null;
    const fromDate = optionalTextArg(args.from_date);
    const toDate = optionalTextArg(args.to_date);
    if (calendarId === null || fromDate === null || toDate === null) return { text: "invalid calendar_list args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await listCalendarEvents(baseUrl, sess, calendarId, fromDate ?? void 0, toDate ?? void 0);
    return { text: formatCalendarOutput(raw), isError: false };
  }
  if (toolName === "approval_todo") {
    const type = optionalTextArg(args.type);
    const page = optionalPositiveIntArg(args.page, 1);
    const size = optionalPositiveIntArg(args.size, 20);
    const searchtype = optionalTextArg(args.searchtype);
    const keyword = optionalTextArg(args.keyword);
    const duration = optionalTextArg(args.duration);
    const fromDate = optionalTextArg(args.from_date);
    const toDate = optionalTextArg(args.to_date);
    if (type === null || page === null || size === null || searchtype === null || keyword === null || duration === null || fromDate === null || toDate === null) return { text: "invalid approval_todo args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await approvalTodo({ ...cfg, base_url: baseUrl }, sess, type ?? "all", page, size, searchtype ?? "", keyword ?? "", duration ?? "", fromDate ?? "", toDate ?? "");
    return { text: formatApprovalOutput(raw, "todo"), isError: false };
  }
  if (toolName === "approval_reference") {
    const kind = optionalTextArg(args.kind);
    const page = optionalPositiveIntArg(args.page, 1);
    const size = optionalPositiveIntArg(args.size, 20);
    const searchtype = optionalTextArg(args.searchtype);
    const keyword = optionalTextArg(args.keyword);
    const duration = optionalTextArg(args.duration);
    const fromDate = optionalTextArg(args.from_date);
    const toDate = optionalTextArg(args.to_date);
    if (kind === null || page === null || size === null || searchtype === null || keyword === null || duration === null || fromDate === null || toDate === null) return { text: "invalid approval_reference args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await approvalReference({ ...cfg, base_url: baseUrl }, sess, kind ?? "reference", page, size, searchtype ?? "", keyword ?? "", duration ?? "", fromDate ?? "", toDate ?? "");
    return { text: formatApprovalOutput(raw, "reference"), isError: false };
  }
  if (toolName === "approval_count") {
    if (!noArgs(args)) return { text: "unexpected arguments", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await approvalCount({ ...cfg, base_url: baseUrl }, sess);
    return { text: formatApprovalOutput(raw, "count"), isError: false };
  }
  if (toolName === "leave_count") {
    const { cfg, session: sess } = await resolveSession();
    const baseUrl = resolveBaseUrl(cfg, sess);
    const raw = await approvalLeaveCount({ ...cfg, base_url: baseUrl }, sess, 4621, 159);
    return { text: formatLeaveCountOutput(raw), isError: false };
  }
  if (toolName === "board_post_create") {
    const boardId = optionalPositiveIntArg(args.board_id, -1);
    const subject = textArg(args.subject);
    const content = textArg(args.content);
    if (boardId === null || boardId < 1 || subject === null || content === null) return { text: "invalid board_post_create args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const raw = await boardPostCreate(cfg, sess, boardId, subject, content);
    return { text: raw, isError: false };
  }
  if (toolName === "board_post_update") {
    const boardId = optionalPositiveIntArg(args.board_id, -1);
    const postId = optionalPositiveIntArg(args.post_id, -1);
    const subject = textArg(args.subject);
    const content = textArg(args.content);
    if (boardId === null || boardId < 1 || postId === null || postId < 1 || subject === null || content === null) return { text: "invalid board_post_update args", isError: true };
    const { cfg, session: sess } = await resolveSession();
    const raw = await boardPostUpdate(cfg, sess, boardId, postId, subject, content);
    return { text: raw, isError: false };
  }
  return { text: "unknown tool", isError: true };
}
async function handleMcpRequest(req) {
  try {
    if (req.method === "initialize") {
      return ok(req.id, { protocolVersion: "2024-11-05", serverInfo: { name: "daou-gw-cli", version: "0.1.0" }, capabilities: { tools: {} } });
    }
    if (req.method === "tools/list") {
      return ok(req.id, { tools: await toolsList() });
    }
    if (req.method === "tools/call") {
      const name = req.params?.name ?? "";
      const validated = validateToolArgs(String(name), req.params?.arguments);
      if (validated.ok === false) {
        return ok(req.id, { content: [{ type: "text", text: validated.error }], isError: true });
      }
      const result = await callTool(String(name), validated.args);
      return ok(req.id, { content: [{ type: "text", text: result.text }], isError: result.isError });
    }
    return fail(req.id, -32601, "method not found");
  } catch (err) {
    return ok(req.id, { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true });
  }
}
async function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let req;
    try {
      req = JSON.parse(trimmed);
    } catch {
      process.stdout.write(`${JSON.stringify(fail(void 0, -32700, "parse error"))}
`);
      continue;
    }
    const resp = await handleMcpRequest(req);
    process.stdout.write(`${JSON.stringify(resp)}
`);
  }
}
if (process.argv[1]?.endsWith("/mcp.js") || process.argv[1]?.endsWith("\\mcp.js") || process.argv[1]?.endsWith("/mcp.ts")) {
  void main();
}
export {
  handleMcpRequest,
  toolsList
};
//# sourceMappingURL=mcp.js.map