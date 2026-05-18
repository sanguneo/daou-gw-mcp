# daou-gw-cli — Agent Guide

This project provides a CLI + MCP server for Daou Office groupware.

## For AI agents

This tool is installed globally as `daou-gw-cli`. All commands support `--json` for machine parsing.

### Quick reference

| Goal | Command |
|------|---------|
| Attend status | `daou-gw-cli attend status` |
| Clock in | `daou-gw-cli attend in` |
| Clock out | `daou-gw-cli attend out` |
| Today's calendar | `daou-gw-cli calendar list --date $(date +%F)` |
| Mail inbox | `daou-gw-cli mail list --size 5` |
| Mail search | `daou-gw-cli mail search --query <keyword> --size 20` |
| Mail delete | `daou-gw-cli mail delete --id <id> [--id <id> ...]` |
| Approval todo | `daou-gw-cli approval todo --size 10` |
| Approval ref | `daou-gw-cli approval reference --size 10` |
| Approval count | `daou-gw-cli approval count` |
| Board create | ← see SKILL.md |
| Session check | `daou-gw-cli session` |

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

### Session persistence

The CLI caches cookies in `~/.daou/session.json`. If a command fails due to stale session, it auto-renews using saved credentials and retries once. No manual re-login needed for routine use.
