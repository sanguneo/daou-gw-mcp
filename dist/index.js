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
  listCalendarEvents,
  listMail,
  loadConfig,
  loadSession,
  login,
  mergeConfig,
  renderAttendanceActionResult,
  resolveBaseUrl,
  resolveSession,
  saveConfig,
  saveSession,
  searchMail,
  sendMail,
  summarizeBoardResult,
  validateSession
} from "./chunk-O5ES5E47.js";

// src/cli.ts
import { readFile } from "fs/promises";
function renderRootHelp(showAttend = false) {
  return [
    "usage: daou-gw-cli <command>",
    "",
    "commands:",
    "  config      show/set local config",
    "  login       login and save session",
    "  session     check saved session",
    showAttend ? "  attend      check/in/out attendance" : null,
    "  mail        list/search/delete/send mail",
    "  approval    list/count approval items",
    "  leavecount  show annual leave usage/balance",
    "  board       create/update/attach board post",
    "  calendar    list calendar events",
    "  help        show help",
    ""
  ].filter((line) => line !== null).join("\n");
}
function renderCommandHelp(command) {
  switch (command) {
    case "config":
      return [
        "usage: daou-gw-cli config <show|set>",
        "",
        "subcommands:",
        "  show",
        "  set [--base-url <url>] [--username <id>] [--password <pw>] [--attend] [--mail-send-url <path>] [--mail-image-upload-url <path>] [--mail-sender-email <email>] [--mail-sender-name <name>] [--board-create-url <path>] [--board-update-url <path>] [--board-attach-url <path>]",
        ""
      ].join("\n");
    case "login":
      return "usage: daou-gw-cli login --username <id> --password <pw> [--base-url <url>] [--json]\n";
    case "session":
      return "usage: daou-gw-cli session [--json]\n";
    case "attend":
    case "attendance":
      return [
        "usage: daou-gw-cli attend <status|in|out>",
        "",
        "subcommands:",
        "  status [--json]",
        "  in     [--json]",
        "  out    [--json]",
        ""
      ].join("\n");
    case "mail":
      return [
        "usage: daou-gw-cli mail <list|search|delete|send>",
        "",
        "subcommands:",
        "  list   [--folder Inbox] [--page 1] [--size 20] [--json]",
        "  search --query <text> [--folder Inbox] [--page 1] [--size 20] [--json]",
        "  delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox] [--json]",
        "  send   --to <email[,email...]> --subject <text> (--content <html>|--html-file <path>|--image <path>) [--cc <email>] [--bcc <email>] [--from-email <email>] [--from-name <name>] [--reserved-at <iso>] [--json]",
        ""
      ].join("\n");
    case "approval":
      return [
        "usage: daou-gw-cli approval <todo|reference|count>",
        "",
        "subcommands:",
        "  todo      [--type all|wait|hold] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]",
        "  reference [--kind reference|read|view] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]",
        "  count     [--json]",
        ""
      ].join("\n");
    case "board":
      return [
        "usage: daou-gw-cli board <create|update>",
        "",
        "subcommands:",
        "  create    --board-id <id> --subject <text> --content <html> [--json]",
        "  update    --board-id <id> --post-id <id> --subject <text> --content <html> [--json]",
        ""
      ].join("\n");
    default:
      return renderRootHelp();
  }
}
function parseFlags(args) {
  const flags = /* @__PURE__ */ new Map();
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const cur = args[i];
    if (!cur.startsWith("--")) {
      rest.push(cur);
      continue;
    }
    const key = cur.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(key, next);
      i += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { flags, rest };
}
function flagString(flags, key, fallback = "") {
  const v = flags.get(key);
  return typeof v === "string" ? v : fallback;
}
function hasFlag(flags, key) {
  return flags.get(key) !== void 0;
}
function boolFlag(flags, key, fallback = false) {
  const v = flags.get(key);
  if (v === void 0) return fallback;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const normalized = v.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    return true;
  }
  return fallback;
}
async function runCli(argv) {
  const args = [...argv];
  const attendOverride = args[0] === "--attend";
  if (attendOverride) args.shift();
  const cfg = await loadConfig();
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(args.length > 0 && args[0] === "help" && args[1] ? renderCommandHelp(args[1]) : renderRootHelp(attendOverride || cfg.attend === true));
    return 0;
  }
  switch (args[0]) {
    case "config":
      return runConfig(args.slice(1));
    case "login":
      return runLogin(args.slice(1));
    case "session":
      return runSession(args.slice(1));
    case "attend":
    case "attendance":
      return runAttend(args.slice(1), attendOverride);
    case "mail":
      return runMail(args.slice(1));
    case "approval":
      return runApproval(args.slice(1));
    case "leavecount":
      return runLeaveCount(args.slice(1));
    case "board":
      return runBoard(args.slice(1));
    case "calendar":
      return runCalendar(args.slice(1));
    default:
      process.stderr.write(renderRootHelp());
      return 1;
  }
}
async function runConfig(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("config"));
    return 0;
  }
  if (args[0] === "show") {
    const cfg2 = await loadConfig();
    process.stdout.write(formatConfig(cfg2));
    return 0;
  }
  if (args[0] !== "set") {
    process.stderr.write(renderCommandHelp("config"));
    return 1;
  }
  if (args[1] === "help" || args[1] === "-h" || args[1] === "--help") {
    process.stdout.write(renderCommandHelp("config"));
    return 0;
  }
  const { flags } = parseFlags(args.slice(1));
  if (flags.size === 0) {
    process.stderr.write(renderCommandHelp("config"));
    return 1;
  }
  const cfg = await loadConfig();
  const next = mergeConfig(cfg, {
    base_url: flagString(flags, "base-url", cfg.base_url),
    username: flagString(flags, "username", cfg.username),
    password: flagString(flags, "password", cfg.password),
    attend: boolFlag(flags, "attend", cfg.attend ?? false),
    mail_send_url: flagString(flags, "mail-send-url", cfg.mail_send_url),
    mail_image_upload_url: flagString(flags, "mail-image-upload-url", cfg.mail_image_upload_url),
    mail_sender_email: flagString(flags, "mail-sender-email", cfg.mail_sender_email),
    mail_sender_name: flagString(flags, "mail-sender-name", cfg.mail_sender_name),
    board_create_url: flagString(flags, "board-create-url", cfg.board_create_url),
    board_update_url: flagString(flags, "board-update-url", cfg.board_update_url),
    board_attach_url: flagString(flags, "board-attach-url", cfg.board_attach_url)
  });
  await saveConfig(next);
  process.stdout.write("ok\n");
  return 0;
}
async function runLogin(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("login"));
    return 0;
  }
  const { flags } = parseFlags(args);
  if (!hasFlag(flags, "username") || !hasFlag(flags, "password")) {
    process.stderr.write(renderCommandHelp("login"));
    return 1;
  }
  const stored = await loadConfig();
  const cfg = mergeConfig(stored, {
    base_url: flagString(flags, "base-url", stored.base_url),
    username: flagString(flags, "username"),
    password: flagString(flags, "password")
  });
  const baseUrl = cfg.base_url?.trim() ?? "";
  if (!baseUrl) {
    process.stderr.write("base url required\n");
    return 1;
  }
  await saveConfig(cfg);
  const session = await login(baseUrl, cfg.username ?? "", cfg.password ?? "");
  await saveSession(session);
  if (hasFlag(flags, "json")) {
    process.stdout.write(`${JSON.stringify(session, null, 2)}
`);
  } else {
    process.stdout.write("login ok\n");
  }
  return 0;
}
async function runAttend(args, attendOverride = false) {
  const enabled = attendOverride || (await loadConfig()).attend === true;
  if (!enabled || args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(enabled ? renderCommandHelp("attend") : renderRootHelp(false));
    return enabled ? 0 : 1;
  }
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const { cfg, session } = await resolveSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  if (sub === "status") {
    const status = await attendanceStatus(baseUrl, session);
    if (hasFlag(flags, "json")) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}
`);
    } else {
      process.stdout.write(formatAttendanceStatus(status));
    }
    return 0;
  }
  if (sub === "in") {
    const result = await clockInAttendance(baseUrl, session);
    if (hasFlag(flags, "json")) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    } else {
      process.stdout.write(`${renderAttendanceActionResult(result)}
`);
    }
    return 0;
  }
  if (sub === "out") {
    const result = await clockOutAttendance(baseUrl, session);
    if (hasFlag(flags, "json")) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
    } else {
      process.stdout.write(`${renderAttendanceActionResult(result)}
`);
    }
    return 0;
  }
  process.stderr.write(renderRootHelp());
  return 1;
}
async function runSession(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("session"));
    return 0;
  }
  const { flags } = parseFlags(args);
  const cfg = await loadConfig();
  const session = await loadSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  const valid = await validateSession(baseUrl, session);
  if (hasFlag(flags, "json")) {
    process.stdout.write(`${JSON.stringify({ valid, session }, null, 2)}
`);
    return 0;
  }
  process.stdout.write(`${valid ? "valid" : "invalid"}
`);
  return 0;
}
async function runMail(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("mail"));
    return 0;
  }
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const { cfg, session } = await resolveSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  const resolvedCfg = { ...cfg, base_url: baseUrl };
  const folder = flagString(flags, "folder", "Inbox");
  const page = Number.parseInt(flagString(flags, "page", "1"), 10) || 1;
  const size = Number.parseInt(flagString(flags, "size", "20"), 10) || 20;
  if (sub === "list") {
    const raw = await listMail(resolvedCfg, session, folder, page, size);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatMailOutput(raw, "list", size));
    return 0;
  }
  if (sub === "search") {
    const query = flagString(flags, "query", "");
    if (!query) {
      process.stderr.write(renderCommandHelp("mail"));
      return 1;
    }
    const raw = await searchMail(resolvedCfg, session, folder, query, page, size);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatMailOutput(raw, "search", size));
    return 0;
  }
  if (sub === "delete") {
    const ids = normalizeIdFlags(args.slice(1));
    if (ids.length === 0) {
      process.stderr.write(renderCommandHelp("mail"));
      return 1;
    }
    const raw = await deleteMail(resolvedCfg, session, ids, flagString(flags, "folder", "Inbox"));
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatMailOutput(raw, "delete"));
    return 0;
  }
  if (sub === "send") {
    const to = flagString(flags, "to", "");
    const subject = flagString(flags, "subject", "");
    const imagePath = flagString(flags, "image", "");
    const content = await resolveMailContent(flags);
    if (!to || !subject || !content.trim() && !imagePath.trim()) {
      process.stderr.write(renderCommandHelp("mail"));
      return 1;
    }
    const raw = await sendMail(resolvedCfg, session, {
      to,
      subject,
      content,
      cc: flagString(flags, "cc", ""),
      bcc: flagString(flags, "bcc", ""),
      senderEmail: flagString(flags, "from-email", ""),
      senderName: flagString(flags, "from-name", ""),
      imagePath,
      reserveMail: hasFlag(flags, "reserved") || hasFlag(flags, "reserve"),
      reservedDateUtc: flagString(flags, "reserved-at", ""),
      receiveNoti: boolFlag(flags, "receive-noti", true),
      saveSent: boolFlag(flags, "save-sent", true)
    });
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatMailOutput(raw, "send"));
    return 0;
  }
  process.stderr.write(renderCommandHelp("mail"));
  return 1;
}
async function runCalendar(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write([
      "usage: daou-gw-cli calendar <list>",
      "",
      "subcommands:",
      "  list [--calendar-id <id[,id...]>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]",
      "  - calendar-id\uC744 \uC0DD\uB7B5\uD558\uBA74 \uB0B4 \uCE98\uB9B0\uB354 \uBAA9\uB85D\uC758 \uBAA8\uB4E0 id\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
      ""
    ].join("\n"));
    return 0;
  }
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const { cfg, session } = await resolveSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  if (sub === "list") {
    const calendarId = hasFlag(flags, "calendar-id") ? flagString(flags, "calendar-id", "") : void 0;
    const fromDate = flagString(flags, "from-date", "");
    const toDate = flagString(flags, "to-date", "");
    const raw = await listCalendarEvents(baseUrl, session, calendarId, fromDate || void 0, toDate || void 0);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatCalendarOutput(raw));
    return 0;
  }
  process.stderr.write([
    "usage: daou-gw-cli calendar <list>",
    "",
    "subcommands:",
    "  list [--calendar-id <id[,id...]>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]",
    "  - calendar-id\uC744 \uC0DD\uB7B5\uD558\uBA74 \uB0B4 \uCE98\uB9B0\uB354 \uBAA9\uB85D\uC758 \uBAA8\uB4E0 id\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.",
    ""
  ].join("\n"));
  return 1;
}
async function runApproval(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("approval"));
    return 0;
  }
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const { cfg, session } = await resolveSession();
  const page = Number.parseInt(flagString(flags, "page", "1"), 10) || 1;
  const size = Number.parseInt(flagString(flags, "size", "20"), 10) || 20;
  const searchType = flagString(flags, "searchtype", "");
  const keyword = flagString(flags, "keyword", "");
  const duration = flagString(flags, "duration", "");
  const fromDate = flagString(flags, "from-date", "");
  const toDate = flagString(flags, "to-date", "");
  const baseUrl = resolveBaseUrl(cfg, session);
  if (sub === "todo") {
    const raw = await approvalTodo({ ...cfg, base_url: baseUrl }, session, flagString(flags, "type", "all"), page, size, searchType, keyword, duration, fromDate, toDate);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatApprovalOutput(raw, "todo"));
    return 0;
  }
  if (sub === "reference" || sub === "ref") {
    const raw = await approvalReference({ ...cfg, base_url: baseUrl }, session, flagString(flags, "kind", "reference"), page, size, searchType, keyword, duration, fromDate, toDate);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatApprovalOutput(raw, "reference"));
    return 0;
  }
  if (sub === "count") {
    const raw = await approvalCount({ ...cfg, base_url: baseUrl }, session);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(formatApprovalOutput(raw, "count"));
    return 0;
  }
  process.stderr.write(renderCommandHelp("approval"));
  return 1;
}
async function runLeaveCount(args) {
  const { flags } = parseFlags(args);
  const formId = Number.parseInt(flagString(flags, "form-id", "4621"), 10) || 4621;
  const deptId = 159;
  const { cfg, session } = await resolveSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  const raw = await approvalLeaveCount({ ...cfg, base_url: baseUrl }, session, formId, deptId);
  if (hasFlag(flags, "json")) {
    const parsed = JSON.parse(raw);
    const variables = parsed?.data?.document?.variables ?? parsed?.document?.variables ?? parsed?.variables ?? {};
    const out = {
      usedPoint: variables.usedPoint,
      restPoint: variables.restPoint,
      additionPoint: variables.additionPoint,
      totalPoint: variables.totalPoint
    };
    process.stdout.write(`${JSON.stringify(out)}
`);
  } else process.stdout.write(formatLeaveCountOutput(raw));
  return 0;
}
async function runBoard(args) {
  if (args.length === 0 || args[0] === "help" || args[0] === "-h" || args[0] === "--help") {
    process.stdout.write(renderCommandHelp("board"));
    return 0;
  }
  const sub = args[0];
  const { flags } = parseFlags(args.slice(1));
  const { cfg, session } = await resolveSession();
  const boardId = Number.parseInt(flagString(flags, "board-id", ""), 10);
  const postId = Number.parseInt(flagString(flags, "post-id", ""), 10);
  const subject = flagString(flags, "subject", "");
  const content = flagString(flags, "content", "");
  if (sub === "create") {
    if (!Number.isInteger(boardId) || boardId <= 0 || !subject || !content) {
      process.stderr.write(renderCommandHelp("board"));
      return 1;
    }
    const raw = await boardPostCreate(cfg, session, boardId, subject, content);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(summarizeBoardResult(raw, "create"));
    return 0;
  }
  if (sub === "update") {
    if (!Number.isInteger(boardId) || boardId <= 0 || !Number.isInteger(postId) || postId <= 0 || !subject || !content) {
      process.stderr.write(renderCommandHelp("board"));
      return 1;
    }
    const raw = await boardPostUpdate(cfg, session, boardId, postId, subject, content);
    if (hasFlag(flags, "json")) process.stdout.write(`${raw}
`);
    else process.stdout.write(summarizeBoardResult(raw, "update"));
    return 0;
  }
  process.stderr.write(renderCommandHelp("board"));
  return 1;
}
async function resolveMailContent(flags) {
  const inline = flagString(flags, "content", "");
  if (inline) return inline;
  const htmlFile = flagString(flags, "html-file", "");
  if (!htmlFile) return "";
  return readFile(htmlFile, "utf8");
}
function normalizeIdFlags(args) {
  const ids = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--id" && args[i + 1]) {
      ids.push(args[i + 1]);
      i += 1;
    }
  }
  return Array.from(new Set(ids.map((v) => v.trim()).filter(Boolean)));
}

// src/index.ts
async function main() {
  process.exitCode = await runCli(process.argv.slice(2));
}
void main();
//# sourceMappingURL=index.js.map