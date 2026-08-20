# daou-gw-cli — Agent Guide

This project provides a CLI + MCP server for Daou Office groupware.

## For AI agents

This tool is installed globally as `daou-gw-cli`. All commands support `--json` for machine parsing.

### Quick reference

| Goal | Command |
|------|---------|
| Session check | `daou-gw-cli session` |
| Today's calendar | `daou-gw-cli calendar list --from-date $(date +%F) --to-date $(date +%F)` |
| Calendar digest | `daou-gw-cli calendar summary --range today\|day\|week\|month [--date YYYY-MM-DD]` |
| Org chart | `daou-gw-cli org tree` |
| Find a person | `daou-gw-cli org search --query <name/dept/position>` |
| Attendance sheet | `daou-gw-cli attend history [--month YYYY-MM]` |
| Mail inbox | `daou-gw-cli mail list --size 5` |
| Mail search | `daou-gw-cli mail search --query <keyword> --size 20` |
| Mail delete | `daou-gw-cli mail delete --id <id> [--id <id> ...]` |
| Mail send | `daou-gw-cli mail send --to <email> --subject <text> --content '<p>...</p>'` |
| Approval todo | `daou-gw-cli approval todo --size 10` |
| Approval ref | `daou-gw-cli approval reference --size 10` |
| Approval count | `daou-gw-cli approval count` |
| Annual leave | `DAOU_LEAVE_FORM_ID=<id> daou-gw-cli leavecount` |
| Find a form | `daou-gw-cli approval form-search --query <text>` |
| Draft a document | `daou-gw-cli approval draft --form-id <id> [--title <t>]` (saves to 임시저장, never submits) |
| Read a document | `daou-gw-cli approval document --document-id <id>` |
| Document boxes | `daou-gw-cli approval box --kind draft\|tempsave\|approve\|viewer\|reception\|send\|official` |
| Board create | `daou-gw-cli board create --board-id <id> --subject <t> --content <html>` |
| Board attach | `daou-gw-cli board attach --board-id <id> --post-id <id> --file <path>` |

`calendar list` has no `--date` flag; use `--from-date` / `--to-date`, or omit both for today plus seven days.

Never guess a flag. `daou-gw-cli <command> --help` is generated from the real schema.

Only the read-only monthly attendance sheet is exposed. Clock status/in/out commands are intentionally unavailable.

### Board posts with images

HTML content supports local file placeholders:

```html
<img src="[{/absolute/path/to/image.png}]" alt="...">
```

The CLI auto-uploads to `/api/file` and replaces the src. Windows paths (`C:\...`) also work.

### Configuration & session

- Config: `~/.daou/config.json` (`base_url`, `username`, encrypted `password`)
- Session: `~/.daou/session.json` (auto-refreshed on expiry)
- Login: `daou-gw-cli login --username <id>`
- Any config field also reads a `DAOU_*` environment variable as a fallback; saved config wins.

### Session persistence

The CLI caches cookies in `~/.daou/session.json`. If a command fails due to a stale session, it re-authenticates with the saved credentials and retries once. No manual re-login is needed for routine use.

## For contributors

Features are defined once as **operations** in `src/ops/`; the CLI commands and the MCP tools are both generated from them. Adding a feature means writing one operation and registering it in `src/ops/index.ts` — never wiring the CLI and MCP separately.

```
src/core/       config, storage, http, session, registry
src/api/        groupware HTTP calls
src/render/     human-readable output
src/ops/        feature definitions (schema + run + render)
src/surfaces/   CLI and MCP generated from ops
```

See the "기능 추가하는 법" section in README.md for the full recipe.
