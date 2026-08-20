#!/usr/bin/env bash
set -euo pipefail

# daou-gw-cli Agent Installer
# Installs this project for Codex, Claude Code, Hermes, OpenClaw and generic agents.
# Usage: bash scripts/install-agent.sh

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HERMES_SKILL_DIR="${HOME}/.hermes/skills/productivity/daou-gw"
CODEX_GUIDE="${HOME}/.codex/AGENTS.md"
OPENCLAW_GUIDE="${HOME}/.openclaw/workspace/AGENTS.md"
OPENCLAW_SKILL_DIR="${HOME}/.openclaw/skills/daou-gw"

info()  { echo -e "  \033[1;34m→\033[0m $*"; }
ok()    { echo -e "  \033[1;32m✓\033[0m $*"; }
skip()  { echo -e "  \033[1;33m…\033[0m $*"; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   daou-gw-cli · Agent Installer      ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── 1. Build ─────────────────────────────────────────────
if [ ! -f "$REPO_DIR/dist/index.js" ]; then
  info "Building CLI..."
  (cd "$REPO_DIR" && npm install && npm run build)
  ok "Build complete"
else
  ok "Already built (dist/index.js exists)"
fi

# ── 2. Global link ────────────────────────────────────────
if command -v daou-gw-cli &>/dev/null; then
  ok "Global symlink exists ($(command -v daou-gw-cli))"
else
  info "Creating global symlink..."
  (cd "$REPO_DIR" && npm link)
  ok "Global symlink created"
fi

# ── 3. Hermes skill ──────────────────────────────────────
if [ -d "${HOME}/.hermes" ]; then
  mkdir -p "$HERMES_SKILL_DIR"
  if [ -f "$REPO_DIR/SKILL.md" ]; then
    cp "$REPO_DIR/SKILL.md" "$HERMES_SKILL_DIR/SKILL.md"
    ok "Hermes skill installed → $HERMES_SKILL_DIR/SKILL.md"
  else
    skip "No SKILL.md found in repo — Hermes skill skipped"
  fi
else
  skip "~/.hermes not found — Hermes skill skipped"
fi

# ── 4. MCP config (optional) ─────────────────────────────
if [ -f "$REPO_DIR/dist/mcp.js" ] && [ -d "${HOME}/.hermes" ]; then
  MCP_CONFIG="${HOME}/.hermes/config.yaml"
  MCP_NAME="daou-gw"
  if command -v yq &>/dev/null; then
    if yq -e ".mcpServers.\"$MCP_NAME\"" "$MCP_CONFIG" &>/dev/null 2>&1; then
      ok "Hermes MCP server '$MCP_NAME' already configured"
    else
      info "Add MCP server '$MCP_NAME' to Hermes config..."
      echo "Manual step: add to $MCP_CONFIG:
  mcpServers:
    daou-gw:
      command: daou-gw-mcp" | tee /dev/stderr
    fi
  fi
fi

# ── 5. Claude Code (CLAUDE.md) ───────────────────────────
if [ -d "${HOME}/.claude" ] || command -v claude &>/dev/null; then
  CLAUDE_DEST="${HOME}/.claude/CLAUDE.md"
  mkdir -p "$(dirname "$CLAUDE_DEST")"
  if [ ! -f "$CLAUDE_DEST" ] || ! grep -q "daou-gw" "$CLAUDE_DEST" 2>/dev/null; then
    cat >> "$CLAUDE_DEST" 2>/dev/null <<'MD'

## daou-gw-cli

Daou Office groupware CLI tool. Installed globally as `daou-gw-cli`.
See `~/.hermes/skills/productivity/daou-gw/SKILL.md` or the repo README for commands.
MD
    ok "Claude Code reference added → $CLAUDE_DEST"
  else
    ok "Claude Code already references daou-gw"
  fi
else
  skip "Claude Code not detected — skipped"
fi

# ── 6. Codex CLI ─────────────────────────────────────────
if [ -d "${HOME}/.codex" ] || command -v codex &>/dev/null; then
  mkdir -p "$(dirname "$CODEX_GUIDE")"
  if [ ! -f "$CODEX_GUIDE" ] || ! grep -q "daou-gw" "$CODEX_GUIDE" 2>/dev/null; then
    cat >> "$CODEX_GUIDE" <<'MD'

## daou-gw-cli

Daou Office groupware CLI. Installed globally as `daou-gw-cli`.
All commands support `--json`; use `daou-gw-cli <command> --help` for flags.
See the repository `AGENTS.md` and `docs/agent-setup.md`.
MD
    ok "Codex reference added → $CODEX_GUIDE"
  else
    ok "Codex already references daou-gw"
  fi
else
  skip "Codex not detected — skipped"
fi

# ── 7. OpenClaw ──────────────────────────────────────────
if [ -d "${HOME}/.openclaw" ] || command -v openclaw &>/dev/null; then
  mkdir -p "$(dirname "$OPENCLAW_GUIDE")" "$OPENCLAW_SKILL_DIR"
  if [ -f "$REPO_DIR/SKILL.md" ]; then
    cp "$REPO_DIR/SKILL.md" "$OPENCLAW_SKILL_DIR/SKILL.md"
    ok "OpenClaw skill installed → $OPENCLAW_SKILL_DIR/SKILL.md"
  fi
  if [ ! -f "$OPENCLAW_GUIDE" ] || ! grep -q "daou-gw" "$OPENCLAW_GUIDE" 2>/dev/null; then
    cat >> "$OPENCLAW_GUIDE" <<'MD'

## daou-gw-cli

Daou Office groupware CLI. Installed globally as `daou-gw-cli`.
All commands support `--json`; use `daou-gw-cli <command> --help` for flags.
The `daou-gw` skill contains the command guide.
MD
    ok "OpenClaw reference added → $OPENCLAW_GUIDE"
  else
    ok "OpenClaw already references daou-gw"
  fi
else
  skip "OpenClaw not detected — skipped"
fi

# ── 8. Generic agents (AGENTS.md) ────────────────────────
AGENTS_DEST="${HOME}/AGENTS.md"
if [ ! -f "$AGENTS_DEST" ] || ! grep -q "daou-gw" "$AGENTS_DEST" 2>/dev/null; then
  cat >> "$AGENTS_DEST" 2>/dev/null <<'MD'

## daou-gw-cli — Daou Office Groupware CLI

Available globally as `daou-gw-cli`. All commands support `--json` for machine parsing.

| Action | Command |
|--------|---------|
| Login | `daou-gw-cli login --username <id>` |
| Session check | `daou-gw-cli session` |
| Mail list | `daou-gw-cli mail list --size N` |
| Mail search | `daou-gw-cli mail search --query <q> --size N` |
| Mail delete | `daou-gw-cli mail delete --id X [--id Y ...]` |
| Mail send | `daou-gw-cli mail send --to <email> --subject <t> --content <html>` |
| Calendar | `daou-gw-cli calendar list [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]` |
| Calendar digest | `daou-gw-cli calendar summary --range today\|day\|week\|month` |
| Approval todo | `daou-gw-cli approval todo [--size N]` |
| Approval reference | `daou-gw-cli approval reference [--size N]` |
| Document boxes | `daou-gw-cli approval box --kind draft\|tempsave\|approve\|viewer\|reception\|send\|official` |
| Find a form | `daou-gw-cli approval form-search --query <text>` |
| Draft a document | `daou-gw-cli approval draft --form-id <id> [--title <t>]` (임시저장까지만) |
| Annual leave | `daou-gw-cli leavecount` |
| Org chart | `daou-gw-cli org tree [--members]` |
| Find a person | `daou-gw-cli org search --query <name/dept>` |
| Board create | `daou-gw-cli board create --board-id <id> --subject <t> --content <html>` |
| Board update | `daou-gw-cli board update --board-id <id> --post-id <id> --subject <t> --content <html>` |
| Board attach | `daou-gw-cli board attach --board-id <id> --post-id <id> --file <path>` |
| Board image | Use `src="[{/absolute/path/file.png}]"` placeholder in HTML — auto-uploaded |
| MCP server | `daou-gw-mcp` (stdio transport) |

Attendance commands (`attend status|in|out|history`) only exist when enabled:
`daou-gw-cli config set --attend`.

Never guess a flag — `daou-gw-cli <command> --help` is generated from the real schema.
MD
  ok "AGENTS.md reference added → $AGENTS_DEST"
else
  ok "AGENTS.md already references daou-gw"
fi

# ── Summary ──────────────────────────────────────────────
echo ""
echo "  ──────────────────────────────────────────────"
echo "   Install path: $(command -v daou-gw-cli || echo '(symlink pending — re-open shell)')"
echo "   Config:       ~/.daou/config.json"
echo "   Session:      ~/.daou/session.json"
echo "   Hermes skill: $HERMES_SKILL_DIR/SKILL.md"
echo "   Agent guide:  $REPO_DIR/docs/agent-setup.md"
echo "  ──────────────────────────────────────────────"
echo ""
echo "   Verification: daou-gw-cli session"
echo ""
