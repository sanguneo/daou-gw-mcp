// src/lib/format.ts
var KST = "Asia/Seoul";
function formatKst(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(d).replace(/\. /g, "-").replace(/\. /g, "-").replace(/\./g, "").replace(/\s+/g, " ");
}
function yesNo(v) {
  return v ? "\uC608" : "\uC544\uB2C8\uC624";
}
function dash(v) {
  return v && v.trim() ? v : "-";
}
function formatConfig(cfg) {
  const lines = [
    "Daou GW \uC124\uC815",
    `- Username: ${dash(cfg.username)}`,
    `- Password: ${cfg.password?.trim() ? "\uC800\uC7A5\uB428" : "\uBBF8\uC800\uC7A5"}`
  ];
  if (cfg.base_url) {
    lines.push(`- Base URL: ${cfg.base_url}`);
  } else {
    lines.push("- Base URL: \uC5C6\uC74C", "- \uACBD\uACE0: \uB85C\uADF8\uC778\uD560 \uB54C --base-url\uB97C \uB123\uC5B4\uC918");
  }
  if (cfg.attend) {
    lines.push(`- Attend: \uD65C\uC131\uD654`);
  }
  if (cfg.mail_list_url || cfg.mail_search_url || cfg.mail_delete_url) {
    lines.push(
      `- Mail List URL: ${dash(cfg.mail_list_url)}`,
      `- Mail Search URL: ${dash(cfg.mail_search_url)}`,
      `- Mail Delete URL: ${dash(cfg.mail_delete_url)}`
    );
  }
  if (cfg.saved_at) {
    lines.push(`- \uC800\uC7A5\uC2DC\uAC01: ${formatKst(cfg.saved_at) ?? cfg.saved_at}`);
  }
  return `${lines.join("\n")}
`;
}
function formatSession(sess) {
  const lines = [
    "Daou GW \uC138\uC158",
    `- User ID: ${sess.user_id ?? "-"}`,
    `- Username: ${dash(sess.username)}`,
    `- Base URL: ${dash(sess.base_url)}`,
    `- Cookies: ${sess.cookies?.length ?? 0}\uAC1C`
  ];
  if (sess.last_check) lines.push(`- \uB9C8\uC9C0\uB9C9 \uD655\uC778: ${formatKst(sess.last_check) ?? sess.last_check}`);
  if (sess.saved_at) lines.push(`- \uC800\uC7A5\uC2DC\uAC01: ${formatKst(sess.saved_at) ?? sess.saved_at}`);
  return `${lines.join("\n")}
`;
}
function formatAttendanceStatus(status) {
  const lines = [
    "\uADFC\uD0DC \uC0C1\uD0DC",
    `- \uB0A0\uC9DC: ${status.today}`,
    `- \uADFC\uBB34\uAD6C\uBD84: ${status.leave || "\uCD9C\uADFC"}`,
    `- \uACF5\uD734\uC77C: ${yesNo(status.holiday)}`,
    `- \uCD9C\uADFC: ${status.clockedIn ? "\uC644\uB8CC" : "\uBBF8\uCC98\uB9AC"}`,
    `- \uD1F4\uADFC: ${status.clockedOut ? "\uC644\uB8CC" : "\uBBF8\uCC98\uB9AC"}`
  ];
  if (status.leaveSource) lines.push(`- \uC77C\uC815 \uCD9C\uCC98: ${status.leaveSource}`);
  if (status.leaveEvent) lines.push(`- \uC77C\uC815 \uB0B4\uC6A9: ${status.leaveEvent}`);
  lines.push("");
  return lines.join("\n");
}
function tryParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function extractArray(value) {
  const candidates = [
    value?.data?.messageList,
    value?.data,
    value?.items,
    value?.list,
    value?.results,
    value?.rows,
    value?.contents,
    value?.messageList
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  if (Array.isArray(value)) return value;
  return [];
}
function countItems(value) {
  return extractArray(value).length;
}
function formatStamp(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(d).replace(/\. /g, "-").replace(/\. /g, "-").replace(/\./g, "").replace(/\s+/g, " ");
}
function formatDateOnly(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}
function formatTimeOnly(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d).replace(/\s+/g, "");
}
function formatMailDate(value) {
  return formatStamp(value);
}
function formatMailEntry(entry, index) {
  if (!isRecord(entry)) return `${index}. -`;
  const seen = typeof entry.seen === "boolean" ? entry.seen : void 0;
  const subject = typeof entry.subject === "string" && entry.subject.trim() ? entry.subject.trim() : "-";
  const from = typeof entry.fromToSimple === "string" && entry.fromToSimple.trim() ? entry.fromToSimple.trim() : typeof entry.from === "string" && entry.from.trim() ? entry.from.trim() : "-";
  const date = formatMailDate(typeof entry.dateUtc === "string" ? entry.dateUtc : typeof entry.sentDateUtc === "string" ? entry.sentDateUtc : void 0);
  const id = typeof entry.id === "number" || typeof entry.id === "string" ? String(entry.id) : "-";
  const flag = seen === void 0 ? "-" : seen ? "\uC77D\uC74C" : "\uC548\uC77D\uC74C";
  return `${index}. [${flag}] ${date} | ${from} | ${subject} (id: ${id})`;
}
function cleanLabel(value) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.replace(/^[-\s]+/, "").replace(/[-\s]+$/, "").trim();
}
function formatCalendarEntry(entry, index, calendarNames) {
  if (!isRecord(entry)) return `${index}. \uB0B4\uC6A9 \uC5C6\uC74C`;
  const title = cleanLabel(
    typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : typeof entry.subject === "string" && entry.subject.trim() ? entry.subject.trim() : typeof entry.eventName === "string" && entry.eventName.trim() ? entry.eventName.trim() : typeof entry.summary === "string" && entry.summary.trim() ? entry.summary.trim() : ""
  ) || "\uB0B4\uC6A9 \uC5C6\uC74C";
  const start = typeof entry.startTime === "string" ? entry.startTime : typeof entry.startDateTime === "string" ? entry.startDateTime : typeof entry.start === "string" ? entry.start : void 0;
  const end = typeof entry.endTime === "string" ? entry.endTime : typeof entry.endDateTime === "string" ? entry.endDateTime : typeof entry.end === "string" ? entry.end : void 0;
  const allDay = entry.timeType === "allday" || entry.allDay === true || entry.type === "holiday";
  const place = cleanLabel(
    typeof entry.location === "string" && entry.location.trim() ? entry.location.trim() : typeof entry.place === "string" && entry.place.trim() ? entry.place.trim() : typeof entry.room === "string" && entry.room.trim() ? entry.room.trim() : ""
  );
  const calendarId = typeof entry.calendarId === "number" || typeof entry.calendarId === "string" ? String(entry.calendarId) : "";
  const calendarName = cleanLabel(calendarNames.get(calendarId) ?? "") || (calendarId ? `\uCE98\uB9B0\uB354 ${calendarId}` : "");
  const dateLabel = allDay ? formatDateOnly(start ?? end) : `${formatDateOnly(start)} ${formatTimeOnly(start)}~${formatTimeOnly(end)}`;
  const placeLabel = place ? ` | ${place}` : "";
  const calendarLabel = calendarName ? ` | ${calendarName}` : "";
  return `${index}. ${dateLabel} | ${title}${placeLabel}${calendarLabel}`;
}
function formatMailOutput(raw, action, displayLimit) {
  const parsed = tryParseJSON(raw);
  if (!parsed) {
    return `\uBA54\uC77C ${action}
- \uC751\uB2F5: ${raw.trim()}
`;
  }
  if (action === "delete") {
    const ok = typeof parsed.ok === "boolean" ? parsed.ok : true;
    const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "-";
    const status = typeof parsed.status === "number" ? parsed.status : "-";
    return [`\uBA54\uC77C \uC0AD\uC81C`, `- \uACB0\uACFC: ${ok ? "\uC131\uACF5" : "\uC2E4\uD328"}`, `- \uC0C1\uD0DC: ${status}`, `- endpoint: ${endpoint}`, ""].join("\n");
  }
  const items = extractArray(parsed);
  const total = items.length;
  const shown = typeof displayLimit === "number" ? Math.min(displayLimit, total) : total;
  const lines = [`\uBA54\uC77C ${action === "list" ? "\uBAA9\uB85D" : "\uAC80\uC0C9"}`, `- \uD56D\uBAA9 \uC218: ${total}`, `- \uD45C\uC2DC \uC218: ${shown}`];
  for (let i = 0; i < shown; i += 1) {
    lines.push(formatMailEntry(items[i], i + 1));
  }
  return `${lines.join("\n")}
`;
}
function formatCalendarOutput(raw) {
  const parsed = tryParseJSON(raw);
  if (!parsed) return `\uCE98\uB9B0\uB354 \uC77C\uC815
\uC751\uB2F5: ${raw.trim()}
`;
  const items = extractArray(parsed);
  const total = items.length;
  const fromDate = typeof parsed.fromDate === "string" ? parsed.fromDate : "-";
  const toDate = typeof parsed.toDate === "string" ? parsed.toDate : "-";
  const calendars = Array.isArray(parsed.calendars) ? parsed.calendars.filter(isRecord) : [];
  const calendarNames = /* @__PURE__ */ new Map();
  for (const calendar of calendars) {
    const id = typeof calendar.id === "number" || typeof calendar.id === "string" ? String(calendar.id) : "";
    const name = cleanLabel(typeof calendar.name === "string" ? calendar.name : "");
    if (id && name) calendarNames.set(id, name);
  }
  const lines = ["\uCE98\uB9B0\uB354 \uC77C\uC815", `\uAE30\uAC04: ${fromDate} ~ ${toDate}`, `\uD56D\uBAA9 \uC218: ${total}`];
  for (let i = 0; i < total; i += 1) {
    lines.push(formatCalendarEntry(items[i], i + 1, calendarNames));
  }
  return `${lines.join("\n")}
`;
}
function formatApprovalOutput(raw, action) {
  const parsed = tryParseJSON(raw);
  if (!parsed) return `\uACB0\uC7AC ${action}
- \uC751\uB2F5: ${raw.trim()}
`;
  if (action === "count") {
    const total2 = typeof parsed.total === "number" ? parsed.total : typeof parsed.count === "number" ? parsed.count : countItems(parsed);
    return [`\uACB0\uC7AC \uAC74\uC218`, `- \uAC74\uC218: ${total2}`, ""].join("\n");
  }
  const total = countItems(parsed);
  return [`\uACB0\uC7AC ${action === "todo" ? "\uD560\uC77C" : "\uCC38\uC870"}`, `- \uD56D\uBAA9 \uC218: ${total}`, ""].join("\n");
}

// src/lib/http.ts
import { Cookie, CookieJar } from "tough-cookie";
function jarFromSession(baseUrl, session) {
  const jar = new CookieJar();
  for (const cookie of session.cookies ?? []) {
    const parsed = Cookie.fromJSON({
      key: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires ? new Date(cookie.expires) : void 0,
      secure: cookie.secure,
      httpOnly: cookie.http_only
    });
    if (parsed) jar.setCookieSync(parsed, baseUrl);
  }
  return jar;
}
function cookiesFromJar(jar) {
  const serialized = jar.serializeSync() ?? { cookies: [] };
  const cookies = serialized.cookies ?? [];
  return cookies.map((c) => ({
    name: String(c.key),
    value: String(c.value),
    path: typeof c.path === "string" ? c.path : void 0,
    expires: typeof c.expires === "string" && c.expires !== "Infinity" ? new Date(c.expires).toISOString() : void 0,
    secure: Boolean(c.secure),
    http_only: Boolean(c.httpOnly)
  }));
}
async function requestText(url, init, session) {
  const jar = session ? jarFromSession(url, session) : void 0;
  const headers = new Headers(init.headers ?? {});
  headers.set("Accept", "application/json, text/plain, */*");
  if (jar) {
    const cookie = await jar.getCookieString(url);
    if (cookie) headers.set("Cookie", cookie);
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  const setCookies = res.headers.getSetCookie?.();
  if (jar && setCookies?.length) {
    for (const raw of setCookies) {
      const parsed = Cookie.parse(raw);
      if (parsed) jar.setCookieSync(parsed, url);
    }
  }
  return { status: res.status, text, jar };
}
async function requestJson(url, init, session) {
  const out = await requestText(url, init, session);
  return { status: out.status, data: JSON.parse(out.text), jar: out.jar };
}

// src/lib/calendar.ts
var KST2 = "Asia/Seoul";
function trimBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}
function todayKst(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST2,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}
function addDaysKst(date, days) {
  const d = /* @__PURE__ */ new Date(`${date}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  return todayKst(d);
}
function kstStart(date) {
  return `${date}T00:00:00.000+09:00`;
}
function kstEnd(date) {
  return `${date}T23:59:59.999+09:00`;
}
function parseExplicitCalendarIds(calendarId) {
  if (calendarId === void 0) return null;
  const ids = calendarId.split(",").map((v) => v.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  for (const id of ids) {
    if (!/^\d+$/.test(id)) return null;
  }
  return ids;
}
function isCalendarSummary(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "number";
}
async function listUserCalendars(baseUrl, session) {
  const userId = session.user_id;
  if (!userId) {
    throw new Error("calendar session user_id missing");
  }
  const url = `${trimBaseUrl(baseUrl)}/api/calendar/user/${userId}/calendar`;
  const { status, data } = await requestJson(url, {
    method: "GET",
    headers: {
      Referer: `${trimBaseUrl(baseUrl)}/app/calendar`,
      Accept: "application/json"
    }
  }, session);
  if (status >= 400) {
    throw new Error(`calendar calendars http ${status}`);
  }
  if (!data || !Array.isArray(data.data)) {
    return [];
  }
  return data.data.filter(isCalendarSummary);
}
async function fetchCalendarEvents(baseUrl, session, calendarId, fromDate = todayKst(), toDate = addDaysKst(fromDate, 7)) {
  const explicitIds = parseExplicitCalendarIds(calendarId);
  const calendars = await listUserCalendars(baseUrl, session);
  const calendarIds = explicitIds ?? calendars.map((calendar) => String(calendar.id));
  if (calendarIds.length === 0) {
    throw new Error("calendar ids missing");
  }
  const params = new URLSearchParams();
  params.set("timeMin", kstStart(fromDate));
  params.set("timeMax", kstEnd(toDate));
  for (const id of calendarIds) {
    params.append("calendarIds[]", id);
  }
  const url = `${trimBaseUrl(baseUrl)}/api/calendar/event?${params.toString()}`;
  const { status, data } = await requestJson(url, {
    method: "GET",
    headers: {
      Referer: `${trimBaseUrl(baseUrl)}/app/calendar`,
      Accept: "application/json"
    }
  }, session);
  if (status >= 400) {
    throw new Error(`calendar list http ${status}`);
  }
  return {
    calendarId: explicitIds === null ? null : explicitIds.join(","),
    calendarIds,
    calendars,
    fromDate,
    toDate,
    data: data.data ?? []
  };
}
async function listCalendarEvents(baseUrl, session, calendarId, fromDate = todayKst(), toDate = addDaysKst(fromDate, 7)) {
  return JSON.stringify(await fetchCalendarEvents(baseUrl, session, calendarId, fromDate, toDate));
}

// src/lib/storage.ts
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { promises as fs } from "fs";
import * as os from "os";
import * as path from "path";
var DAOU_DIR_NAME = ".daou";
var CONFIG_FILE = "config.json";
var SESSION_FILE = "session.json";
var PASSWORD_PREFIX = "enc:v1:";
var VAULT_KEY_FILE = "vault.key";
var VAULT_ALGO = "aes-256-gcm";
var VAULT_KEY_BYTES = 32;
var VAULT_IV_BYTES = 12;
function homeDir() {
  return path.join(os.homedir(), DAOU_DIR_NAME);
}
async function ensureHome() {
  const dir = homeDir();
  await fs.mkdir(dir, { recursive: true, mode: 448 });
  return dir;
}
async function configPath() {
  return path.join(await ensureHome(), CONFIG_FILE);
}
async function sessionPath() {
  return path.join(await ensureHome(), SESSION_FILE);
}
async function vaultKeyPath() {
  return path.join(await ensureHome(), VAULT_KEY_FILE);
}
async function loadOrCreateVaultKey() {
  const p = await vaultKeyPath();
  try {
    const raw = await fs.readFile(p);
    if (raw.length !== VAULT_KEY_BYTES) {
      throw new Error(`invalid vault key length: ${raw.length}`);
    }
    return raw;
  } catch (err) {
    const e = err;
    if (e?.code !== "ENOENT") throw err;
    const key = randomBytes(VAULT_KEY_BYTES);
    await fs.writeFile(p, key, { mode: 384 });
    return key;
  }
}
function encryptPasswordWithKey(password, key) {
  const iv = randomBytes(VAULT_IV_BYTES);
  const cipher = createCipheriv(VAULT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PASSWORD_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decryptPasswordWithKey(value, key) {
  const cipherText = value.startsWith(PASSWORD_PREFIX) ? value.slice(PASSWORD_PREFIX.length) : value;
  const parts = cipherText.split(".");
  if (parts.length !== 3) throw new Error("invalid encrypted password format");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv(VAULT_ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
async function encryptPassword(value) {
  const key = await loadOrCreateVaultKey();
  return encryptPasswordWithKey(value, key);
}
async function decryptPassword(value) {
  const key = await loadOrCreateVaultKey();
  return decryptPasswordWithKey(value, key);
}
async function normalizeConfigPassword(cfg) {
  if (!cfg.password) return { cfg, migrated: false };
  if (cfg.password.startsWith(PASSWORD_PREFIX)) {
    return { cfg: { ...cfg, password: await decryptPassword(cfg.password) }, migrated: false };
  }
  return { cfg: { ...cfg, password: cfg.password }, migrated: true };
}
async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}
async function writeJsonPrivate(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 448 });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), { mode: 384 });
}
async function loadConfig() {
  const p = await configPath();
  try {
    const raw = await readJson(p);
    const { cfg, migrated } = await normalizeConfigPassword(raw);
    if (migrated) {
      await writeJsonPrivate(p, { ...cfg, password: await encryptPassword(cfg.password ?? "") });
    }
    return cfg;
  } catch (err) {
    const e = err;
    if (e?.code === "ENOENT") return {};
    throw err;
  }
}
async function saveConfig(cfg) {
  const next = { ...cfg };
  if (next.password) {
    next.password = next.password.startsWith(PASSWORD_PREFIX) ? next.password : await encryptPassword(next.password);
  }
  if (!next.saved_at) next.saved_at = (/* @__PURE__ */ new Date()).toISOString();
  await writeJsonPrivate(await configPath(), next);
}
async function loadSession() {
  const p = await sessionPath();
  try {
    return await readJson(p);
  } catch (err) {
    const e = err;
    if (e?.code === "ENOENT") return {};
    throw err;
  }
}
async function saveSession(session) {
  const next = { ...session, saved_at: (/* @__PURE__ */ new Date()).toISOString() };
  await writeJsonPrivate(await sessionPath(), next);
}

// src/lib/auth.ts
function ensureBaseUrl(baseUrl) {
  const root = baseUrl?.trim();
  if (!root) throw new Error("base url required");
  return root.replace(/\/$/, "");
}
async function login(baseUrl, username, password) {
  const root = ensureBaseUrl(baseUrl);
  const loginUrl = `${root}/api/login`;
  const first = await requestText(loginUrl, {
    method: "POST",
    body: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json", Accept: "application/json" }
  }, { base_url: root, cookies: [] });
  if (first.status >= 400) {
    throw new Error(`login http ${first.status}`);
  }
  if (!first.jar) {
    throw new Error("login cookie jar unavailable");
  }
  const sessionInfo = await userSession(root, { base_url: root, cookies: cookiesFromJar(first.jar) });
  return {
    user_id: sessionInfo.id,
    username,
    base_url: root,
    cookies: cookiesFromJar(first.jar),
    last_check: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function userSession(baseUrl, session) {
  const url = `${ensureBaseUrl(baseUrl)}/api/user/session`;
  const { status, data } = await requestJson(url, { method: "GET" }, session);
  if (status >= 400) throw new Error(`session http ${status}`);
  if (!data?.data?.id) throw new Error("empty session");
  return { id: data.data.id, name: data.data.name };
}
async function validateSession(baseUrl, session) {
  try {
    await userSession(baseUrl, session);
    return true;
  } catch {
    return false;
  }
}
function mergeConfig(cfg, patch) {
  return {
    ...cfg,
    ...patch,
    base_url: patch.base_url?.trim() || cfg.base_url?.trim()
  };
}

// src/lib/session.ts
function resolveBaseUrl(cfg, _session) {
  const baseUrl = cfg.base_url?.trim();
  if (!baseUrl) throw new Error("base url required");
  return baseUrl.replace(/\/$/, "");
}
async function resolveSession() {
  const cfg = await loadConfig();
  const session = await loadSession();
  const baseUrl = resolveBaseUrl(cfg, session);
  if (await validateSession(baseUrl, session)) {
    return { cfg, session, refreshed: false };
  }
  if (!cfg.username || !cfg.password) {
    throw new Error("session invalid and credentials missing");
  }
  const refreshed = await login(baseUrl, cfg.username, cfg.password);
  await saveSession(refreshed);
  return { cfg, session: refreshed, refreshed: true };
}

// src/lib/attendance.ts
var KST3 = "Asia/Seoul";
function todayKst2(date = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST3,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}
function trimBaseUrl2(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}
function normalizeText(value) {
  return (value ?? "").trim().replace(/\s+/g, "").toLowerCase();
}
function extractEventText(event) {
  const candidates = [event.title, event.subject, event.summary, event.eventName, event.name];
  return candidates.filter((value) => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).join(" ");
}
function isWeekendKst(date) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: KST3, weekday: "short" }).format(/* @__PURE__ */ new Date(`${date}T00:00:00.000+09:00`));
  return weekday === "Sat" || weekday === "Sun";
}
function fixedHolidayName(date) {
  switch (date.slice(5)) {
    case "01-01":
      return "\uC2E0\uC815";
    case "03-01":
      return "\uC0BC\uC77C\uC808";
    case "05-05":
      return "\uC5B4\uB9B0\uC774\uB0A0";
    case "06-06":
      return "\uD604\uCDA9\uC77C";
    case "08-15":
      return "\uAD11\uBCF5\uC808";
    case "10-03":
      return "\uAC1C\uCC9C\uC808";
    case "10-09":
      return "\uD55C\uAE00\uB0A0";
    case "12-25":
      return "\uD06C\uB9AC\uC2A4\uB9C8\uC2A4";
    default:
      return null;
  }
}
function detectLeaveFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  if (normalized.includes("\uC624\uC804\uBC18\uCC28")) return { leave: "\uC624\uC804\uBC18\uCC28", holiday: false };
  if (normalized.includes("\uC624\uD6C4\uBC18\uCC28")) return { leave: "\uC624\uD6C4\uBC18\uCC28", holiday: false };
  if (normalized.includes("\uBC18\uCC28")) return { leave: "\uBC18\uCC28", holiday: false };
  if (normalized.includes("\uC5F0\uCC28") || normalized.includes("\uC5F0\uCC28\uD734\uAC00") || normalized.includes("\uD734\uAC00")) return { leave: "\uC5F0\uCC28", holiday: false };
  return null;
}
function detectHolidayFromDate(date) {
  if (isWeekendKst(date)) return { holiday: true, leaveEvent: "\uC8FC\uB9D0" };
  const name = fixedHolidayName(date);
  if (name) return { holiday: true, leaveEvent: name };
  return null;
}
function detectCalendarLeave(events) {
  for (const item of events) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const event = item;
    const text = extractEventText(event);
    const detected = detectLeaveFromText(text);
    if (!detected) continue;
    return {
      leave: detected.leave,
      holiday: false,
      leaveEvent: text || void 0
    };
  }
  return null;
}
function shouldBlockAttendance(status) {
  return status.holiday || status.leave !== "\uCD9C\uADFC";
}
async function attendanceHistory(baseUrl, session, userId, today = todayKst2()) {
  const url = `${trimBaseUrl2(baseUrl)}/api/ehr/timeline/month?baseDate=${encodeURIComponent(today)}&userId=${encodeURIComponent(String(userId))}`;
  const { data } = await requestJson(url, {
    method: "GET",
    headers: {
      Referer: `${trimBaseUrl2(baseUrl)}/app/ehr`,
      Accept: "application/json",
      timezoneoffset: "540"
    }
  }, session);
  for (const weekItem of data.weekList ?? []) {
    const week = weekItem;
    const dailyList = week.dailyList;
    if (!dailyList) continue;
    for (const dailyItem of dailyList) {
      const daily = dailyItem;
      const detailDay = daily.detailDay;
      if (String(detailDay?.day ?? "") !== today) continue;
      return {
        clockedIn: daily.clockInHistory != null,
        clockedOut: daily.clockOutHistory != null
      };
    }
  }
  throw new Error("\uC624\uB298 \uB370\uC774\uD130 \uC5C6\uC74C");
}
async function attendanceStatus(baseUrl, session) {
  const user = await userSession(baseUrl, session);
  const today = todayKst2();
  const [calendar, history] = await Promise.all([
    fetchCalendarEvents(baseUrl, session, void 0, today, today).catch(() => null),
    attendanceHistory(baseUrl, session, user.id, today).catch(() => ({ clockedIn: false, clockedOut: false }))
  ]);
  const calendarLeave = calendar ? detectCalendarLeave(calendar.data) : null;
  const dateHoliday = detectHolidayFromDate(today);
  const holiday = dateHoliday?.holiday ?? false;
  const leave = calendarLeave?.leave ?? (holiday ? "\uD734\uC77C" : "\uCD9C\uADFC");
  const leaveEvent = calendarLeave?.leaveEvent ?? dateHoliday?.leaveEvent;
  return {
    userId: user.id,
    today,
    leave,
    holiday,
    leaveEvent,
    leaveSource: calendarLeave ? "calendar" : void 0,
    clockedIn: history.clockedIn,
    clockedOut: history.clockedOut
  };
}
async function clockAttendance(baseUrl, userId, now, action, session) {
  const workingDay = todayKst2(now);
  const url = `${trimBaseUrl2(baseUrl)}/api/ehr/timeline/status/${action}?userId=${encodeURIComponent(String(userId))}&baseDate=${encodeURIComponent(workingDay)}`;
  const body = {
    checkTime: now.toISOString(),
    timelineStatus: {},
    isNightWork: false,
    workingDay
  };
  const { status, text } = await requestText(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Referer: `${trimBaseUrl2(baseUrl)}/app/ehr`,
      timezoneoffset: "540"
    }
  }, session);
  if (status >= 400) {
    throw new Error(`${action} http ${status}: ${text.trim()}`);
  }
}
async function clockInAttendance(baseUrl, session) {
  const status = await attendanceStatus(baseUrl, session);
  if (shouldBlockAttendance(status)) {
    return { ok: false, action: "in", userId: status.userId, today: status.today, status: "skip", reason: "leave_or_holiday", blockedBy: status.leave };
  }
  if (status.clockedIn) {
    return { ok: true, action: "in", userId: status.userId, today: status.today, status: "already" };
  }
  await clockAttendance(baseUrl, status.userId, /* @__PURE__ */ new Date(), "clockIn", session);
  return { ok: true, action: "in", userId: status.userId, today: status.today, status: "done" };
}
async function clockOutAttendance(baseUrl, session) {
  const status = await attendanceStatus(baseUrl, session);
  if (shouldBlockAttendance(status)) {
    return { ok: false, action: "out", userId: status.userId, today: status.today, status: "skip", reason: "leave_or_holiday", blockedBy: status.leave };
  }
  if (!status.clockedIn) {
    return { ok: false, action: "out", userId: status.userId, today: status.today, status: "skip", reason: "not_clocked_in" };
  }
  if (status.clockedOut) {
    return { ok: true, action: "out", userId: status.userId, today: status.today, status: "already" };
  }
  return { ok: true, action: "out", userId: status.userId, today: status.today, status: "dryrun", dryRun: true };
}
function renderAttendanceActionResult(result) {
  switch (result.status) {
    case "done":
      return result.action === "in" ? "\uCD9C\uADFC \uCC98\uB9AC \uC644\uB8CC" : "\uD1F4\uADFC \uCC98\uB9AC \uC644\uB8CC";
    case "already":
      return result.action === "in" ? "\uC774\uBBF8 \uCD9C\uADFC \uCC98\uB9AC\uB428" : "\uC774\uBBF8 \uD1F4\uADFC \uCC98\uB9AC\uB428";
    case "dryrun":
      return "\uD1F4\uADFC dry-run: \uC2E4\uC81C \uD638\uCD9C \uC548 \uD568";
    case "skip":
      if (result.reason === "not_clocked_in") return "\uAC74\uB108\uB700: \uC544\uC9C1 \uCD9C\uADFC \uCC98\uB9AC \uC804";
      if (result.reason === "leave_or_holiday") return `\uAC74\uB108\uB700: ${result.blockedBy ?? "\uC5F0\uCC28/\uBC18\uCC28/\uD734\uC77C"} \uC77C\uC815 \uC788\uC74C`;
      return "\uAC74\uB108\uB700";
  }
}

// src/lib/mail.ts
function resolveMailEndpoint(baseURL, configured, envKey, defaultCandidate, candidates) {
  const direct = configured.trim();
  if (direct) return direct;
  if (envKey) {
    const env = (process.env[envKey] ?? "").trim();
    if (env) return env;
  }
  if (defaultCandidate.trim()) return defaultCandidate;
  for (const candidate of candidates) {
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "";
}
function normalizeMailFolder(folder) {
  const s = folder.trim();
  if (!s) return "Inbox";
  if (/^inbox$/i.test(s)) return "Inbox";
  if (/^sent$/i.test(s)) return "Sent";
  if (/^drafts?$/i.test(s)) return "Drafts";
  if (/^trash$/i.test(s)) return "Trash";
  if (/^spam$/i.test(s)) return "Spam";
  if (/^all$/i.test(s)) return "all";
  return s;
}
function trimBase(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}
function joinBaseURL(baseURL, endpoint) {
  const trimmed = endpoint.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${trimBase(baseURL)}/${trimmed.replace(/^\//, "")}`;
}
function candidateURLs(baseURL, endpoint, candidates) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  const add = (v) => {
    const t = v.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  if (endpoint) add(joinBaseURL(baseURL, endpoint));
  for (const c of candidates) add(joinBaseURL(baseURL, c));
  return out;
}
function mailConfiguredURL(cfg, action) {
  if (action === "list") return cfg.mail_list_url ?? "";
  if (action === "search") return cfg.mail_search_url ?? "";
  return cfg.mail_delete_url ?? "";
}
function mailEnvKey(action) {
  if (action === "list") return "DAOU_MAIL_LIST_URL";
  if (action === "search") return "DAOU_MAIL_SEARCH_URL";
  return "DAOU_MAIL_DELETE_URL";
}
function mailDefaultCandidate(action) {
  if (action === "delete") return "/api/mail/message/delete";
  return "/api/mail/message/list";
}
function mailFallbackCandidates(action) {
  if (action === "delete") return ["/api/mail/message/delete", "/api/mail/delete", "/api/mail/message/clean", "/api/mail/message/all"];
  return ["/api/mail/message/list", "/api/mail/list", "/api/mail/message/all", "/api/mail/inbox", "/api/mail/messages"];
}
async function callMailAction(cfg, session, action, method, query, body) {
  const baseUrl = cfg.base_url?.trim() ?? "";
  if (!baseUrl) throw new Error("base url required");
  const endpoint = resolveMailEndpoint(baseUrl, mailConfiguredURL(cfg, action), mailEnvKey(action), mailDefaultCandidate(action), mailFallbackCandidates(action));
  const urls = candidateURLs(baseUrl, endpoint, mailFallbackCandidates(action));
  let lastErr = null;
  for (const target of urls) {
    const url = new URL(target);
    if (query && method === "GET") {
      for (const [k, v] of Array.from(query.entries())) url.searchParams.append(k, v);
    }
    const { status, text } = await requestText(url.toString(), {
      method,
      body: method === "GET" || body == null ? void 0 : JSON.stringify(body),
      headers: method === "GET" ? { Accept: "application/json, text/plain, */*" } : { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" }
    }, session);
    if (status >= 400) {
      lastErr = new Error(`${action} http ${status}: ${text.trim()}`);
      continue;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return JSON.stringify({ endpoint: url.toString(), status, ok: true });
    }
    if (trimmed.startsWith("<")) {
      lastErr = new Error(`${action} returned html from ${url.toString()}`);
      continue;
    }
    return trimmed;
  }
  throw lastErr ?? new Error(`${action} request failed`);
}
async function listMail(cfg, session, folder, page, size) {
  const normalizedFolder = normalizeMailFolder(folder);
  const params = new URLSearchParams();
  params.set("folder", normalizedFolder);
  params.set("page", String(page));
  params.set("size", String(size));
  params.set("offset", String(size));
  params.set("limit", String(size));
  const body = { folder: normalizedFolder, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, "list", "POST", null, body);
  } catch {
    return callMailAction(cfg, session, "list", "GET", params, null);
  }
}
async function searchMail(cfg, session, folder, query, page, size) {
  const normalizedFolder = normalizeMailFolder(folder);
  const params = new URLSearchParams();
  params.set("folder", normalizedFolder);
  params.set("query", query);
  params.set("q", query);
  params.set("keyword", query);
  params.set("keyWord", query);
  params.set("page", String(page));
  params.set("size", String(size));
  params.set("offset", String(size));
  params.set("limit", String(size));
  const body = { folder: normalizedFolder, query, q: query, keyword: query, keyWord: query, page, size, offset: size, limit: size, pageNo: page, pageSize: size };
  try {
    return await callMailAction(cfg, session, "search", "POST", null, body);
  } catch {
    return callMailAction(cfg, session, "search", "GET", params, null);
  }
}
async function deleteMail(cfg, session, ids, folder) {
  const normalizedFolder = normalizeMailFolder(folder);
  const payload = {
    folderNames: [normalizedFolder],
    uids: ids,
    folder: normalizedFolder,
    id: ids[0] ?? "",
    ids,
    mailId: ids[0] ?? "",
    mailIds: ids,
    messageId: ids[0] ?? "",
    messageIds: ids
  };
  return callMailAction(cfg, session, "delete", "POST", null, payload);
}

// src/lib/approval.ts
function trimBase2(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}
async function doApprovalGet(cfg, session, path2) {
  const baseUrl = cfg.base_url?.trim() ?? "";
  if (!baseUrl) throw new Error("base url required");
  const url = `${trimBase2(baseUrl)}${path2}`;
  const { status, text } = await requestText(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${trimBase2(baseUrl)}/app/approval/todo`
    }
  }, session);
  if (status >= 400) {
    throw new Error(`http ${status}: ${text.trim()}`);
  }
  return text.trim();
}
function approvalQuery(page, size, searchType, keyword, duration, fromDate, toDate) {
  const q = new URLSearchParams();
  q.set("page", String(page - 1));
  q.set("offset", String(size));
  q.set("property", "document.isEmergency");
  q.set("direction", "desc");
  q.set("searchtype", searchType);
  q.set("keyword", keyword);
  if (duration.trim()) q.set("duration", duration);
  if (fromDate.trim()) q.set("fromDate", fromDate);
  if (toDate.trim()) q.set("toDate", toDate);
  return q.toString();
}
async function approvalTodo(cfg, session, listType, page, size, searchType, keyword, duration, fromDate, toDate) {
  const kind = listType.trim().toLowerCase();
  if (!["all", "wait", "hold", "reference", "read", "view"].includes(kind)) {
    throw new Error("approval type\uB294 all|wait|hold, reference kind\uB294 reference|read|view");
  }
  const query = approvalQuery(page, size, searchType, keyword, duration, fromDate, toDate);
  return doApprovalGet(cfg, session, `/api/approval/todo/${kind}?${query}`);
}
async function approvalReference(cfg, session, kind, page, size, searchType, keyword, duration, fromDate, toDate) {
  const refKind = kind.trim().toLowerCase();
  if (!["reference", "read", "view"].includes(refKind)) {
    throw new Error("approval reference kind\uB294 reference|read|view");
  }
  const query = approvalQuery(page, size, searchType, keyword, duration, fromDate, toDate);
  return doApprovalGet(cfg, session, `/api/approval/todo/${refKind}?${query}`);
}
async function approvalCount(cfg, session) {
  return doApprovalGet(cfg, session, "/api/approval/todo/count");
}

export {
  formatConfig,
  formatSession,
  formatAttendanceStatus,
  formatMailOutput,
  formatCalendarOutput,
  formatApprovalOutput,
  listCalendarEvents,
  loadConfig,
  saveConfig,
  loadSession,
  saveSession,
  login,
  validateSession,
  mergeConfig,
  resolveBaseUrl,
  resolveSession,
  attendanceStatus,
  clockInAttendance,
  clockOutAttendance,
  renderAttendanceActionResult,
  listMail,
  searchMail,
  deleteMail,
  approvalTodo,
  approvalReference,
  approvalCount
};
//# sourceMappingURL=chunk-ZWVM2TRF.js.map