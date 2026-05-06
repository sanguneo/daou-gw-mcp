# Daou GW CLI TypeScript/NPM Migration Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Go 기반 `daou-gw-cli`/`daou-gw-mcp`를 npm으로 설치·실행 가능한 TypeScript CLI/MCP 패키지로 전환한다.

**Architecture:** HTTP/API-first 구조는 유지한다. 브라우저/CDP는 본체에 넣지 않고, `~/.daou/`의 기존 `config.json`/`session.json` 포맷을 최대한 그대로 읽어 Go 버전과 세션 호환성을 유지한다. CLI 출력 정책은 현재 결정대로 `--json`이 있을 때만 JSON, 기본은 한글 요약 포맷이다.

**Tech Stack:** TypeScript, Node.js 20+, commander, undici/fetch, tough-cookie, zod, vitest, tsx, tsup.

---

## Current Go Surface to Preserve

Binary names:
- `daou-gw-cli`
- `daou-gw-mcp`

Storage:
- `~/.daou/config.json`
- `~/.daou/session.json`
- `~/.daou/endpoints.json`
- permissions should stay private where possible: directory `0700`, files `0600`

Commands:
- `daou-gw-cli help`
- `daou-gw-cli help <command>`
- `<command> help`
- `<command> <subcommand> help`
- `config show`
- `config set --base-url ... --username ... --password ...`
- `login [--json]`
- `session check [--json]`
- `attendance status [--json]`
- `attendance in [--json]`
- `attendance out [--json]`
- `mail list [--folder inbox] [--page 1] [--size 20] [--json]`
- `mail search --query <text> [--folder inbox] [--page 1] [--size 20] [--json]`
- `mail delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox] [--json]`
- `approval todo ... [--json]`
- `approval reference ... [--json]`
- `approval count [--json]`

Behavior contracts:
- explicit help => stdout, exit 0
- invalid/missing args => stderr, non-zero
- usage lines include full prefix: `usage: daou-gw-cli ...`
- no `attendance clockin`
- no `--attend-hour`
- no random delay
- no cron/scheduling in CLI
- `mail --size` controls displayed count and request pagination fields: `size`, `offset`, `limit`, `pageSize`
- MCP remains thin adapter over shared CLI/client helpers

---

### Task 1: Add npm/TypeScript project skeleton

**Objective:** Create an npm package without deleting Go files yet, so behavior can be ported incrementally.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/mcp.ts`
- Create: `src/cli.ts`
- Create: `src/lib/types.ts`

**Step 1: Write failing smoke test**

Create `src/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { renderRootHelp } from './cli';

describe('root help', () => {
  it('prints copy-pasteable root usage', () => {
    expect(renderRootHelp()).toContain('usage: daou-gw-cli <command>');
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
npm test -- --run src/cli.test.ts
```

Expected: FAIL because npm project / test script does not exist yet.

**Step 3: Add minimal npm skeleton**

`package.json`:

```json
{
  "name": "daou-gw-cli",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "bin": {
    "daou-gw-cli": "dist/index.js",
    "daou-gw-mcp": "dist/mcp.js"
  },
  "scripts": {
    "dev": "tsx src/index.ts",
    "dev:mcp": "tsx src/mcp.ts",
    "build": "tsup src/index.ts src/mcp.ts --format esm --dts --sourcemap --clean --banner.js '#!/usr/bin/env node'",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "latest",
    "tough-cookie": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@types/node": "latest",
    "tsx": "latest",
    "tsup": "latest",
    "typescript": "latest",
    "vitest": "latest"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**Step 4: Implement minimal help renderer**

`src/cli.ts`:

```ts
export function renderRootHelp(): string {
  return [
    'usage: daou-gw-cli <command>',
    '',
    'commands:',
    '  config      show/set local config',
    '  login       login and save session',
    '  session     check saved session',
    '  attendance  show attendance status or clock in/out',
    '  mail        list/search/delete mail',
    '  approval    list/count approval items',
    '  help        show help',
    '',
  ].join('\n');
}
```

**Step 5: Verify**

Run:

```bash
npm install
npm test -- --run src/cli.test.ts
npm run typecheck
```

Expected: PASS.

---

### Task 2: Port storage/config/session layer

**Objective:** Preserve existing `~/.daou/*.json` compatibility.

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/lib/storage.test.ts`
- Modify: `src/lib/types.ts`

**Tests first:**
- `homeDir()` resolves to `${HOME}/.daou`
- `writeJsonPrivate()` creates parent dir and writes JSON
- `loadConfig()` returns default base URL if missing
- `saveSession()` / `loadSession()` roundtrip Go-compatible session shape

**Implementation notes:**
- Use `os.homedir()` and `path.join()`.
- Use `fs.promises.mkdir(dir, { recursive: true, mode: 0o700 })`.
- Use `fs.promises.writeFile(path, json, { mode: 0o600 })`.
- Do not print cookies/passwords in errors.

---

### Task 3: Port HTTP client and cookie handling

**Objective:** Build a fetch helper that loads cookies from `session.json` and sends Daou API requests.

**Files:**
- Create: `src/lib/http.ts`
- Create: `src/lib/http.test.ts`

**Tests first:**
- saved cookies convert into `Cookie` header for `gw.aegisep.com`
- request helper sets `Accept: application/json, text/plain, */*`
- JSON response is parsed safely
- HTML response can be treated as endpoint mismatch

**Implementation notes:**
- Node 20 fetch is enough; use `tough-cookie` if cookie domain/path matching gets complex.
- Keep a narrow API: `requestJson<T>(url, options, session)`.

---

### Task 4: Port login/session commands

**Objective:** `login` saves session, `session check` validates it.

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/auth.test.ts`
- Modify: `src/cli.ts`
- Modify: `src/index.ts`

**Tests first:**
- mock login endpoint returns cookies => `Session` saved with cookies/user info
- `session check` with `--json` prints JSON
- default `session check` prints Korean summary

**Verification commands:**

```bash
npm test -- --run src/lib/auth.test.ts
npm run dev -- session check
npm run dev -- session check --json
```

---

### Task 5: Port attendance commands

**Objective:** Preserve `attendance status/in/out` behavior.

**Files:**
- Create: `src/lib/attendance.ts`
- Create: `src/lib/attendance.test.ts`
- Modify: `src/cli.ts`

**Tests first:**
- `attendance help` includes `status|in|out`
- help does not include `clockin`, `attend-hour`, random delay
- `clockIn()` calls `/api/ehr/timeline/status/clockIn`
- `clockOut()` calls `/api/ehr/timeline/status/clockOut`
- default output is Korean summary
- `--json` prints JSON

---

### Task 6: Port mail commands

**Objective:** Preserve `mail list/search/delete` and pretty output.

**Files:**
- Create: `src/lib/mail.ts`
- Create: `src/lib/mail.test.ts`
- Modify: `src/cli.ts`

**Tests first:**
- `mail search` without query prints usage to stderr and exits non-zero
- `mail search --query AWS --size 1` displays one item
- request body/query includes `size`, `offset`, `limit`, `pageSize`
- default output is Korean summary, not raw JSON
- `--json` prints raw JSON

---

### Task 7: Port approval commands

**Objective:** Preserve approval todo/reference/count HTTP endpoints and output policy.

**Files:**
- Create: `src/lib/approval.ts`
- Create: `src/lib/approval.test.ts`
- Modify: `src/cli.ts`

**Tests first:**
- `approval count` formats Korean summary
- `approval todo --size 3` sends `offset=3`
- `approval reference --kind reference` uses reference endpoint
- `--json` prints JSON

---

### Task 8: Port MCP stdio adapter

**Objective:** Recreate `daou-gw-mcp` as a thin adapter over shared TS helpers.

**Files:**
- Create: `src/mcp.ts`
- Create: `src/mcp.test.ts`

**Tests first:**
- `tools/list` exposes same tool names
- `attendance_in/out`, `mail_search`, `approval_count` call shared helpers
- MCP responses remain machine-readable JSON/text as appropriate

---

### Task 9: Add parity verification script

**Objective:** Compare important Go and TS CLI outputs during migration.

**Files:**
- Create: `scripts/parity-check.mjs`

**Checks:**
- root help
- command help
- attendance help
- invalid usage exit codes
- `mail search --query AWS --size 1` item count
- `approval count` format

---

### Task 10: Cutover

**Objective:** Make TS package the primary implementation after parity passes.

**Files:**
- Create: `README.md`
- Optional move: `legacy-go/` for old Go source if keeping reference

**Steps:**
1. Run Go tests: `go test ./...`
2. Run TS tests: `npm test -- --run`
3. Run typecheck: `npm run typecheck`
4. Run build: `npm run build`
5. Run CLI smoke:
   ```bash
   node dist/index.js help
   node dist/index.js mail search --query AWS --size 1
   node dist/index.js approval count
   ```
6. If all pass, use npm bin as main workflow.

---

## Recommended First Implementation Slice

Start with these only:
1. npm skeleton
2. storage/session compatibility
3. CLI help/usage parity
4. mail search/list pretty output with `--size`

Reason: this gives immediate npm usability without risking attendance/approval behavior.

