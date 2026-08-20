# 에이전트 설치 가이드

`daou-gw-cli`는 모든 에이전트에서 같은 CLI와 MCP 서버를 사용합니다.
차이는 에이전트마다 지침 파일, 스킬 디렉터리, MCP 등록 방법이 다르다는 점뿐입니다.

## 공통 설치

Git Bash, WSL 또는 macOS/Linux 셸에서 실행합니다.

```bash
bash scripts/install-agent.sh
daou-gw-cli session
```

스크립트는 프로젝트를 빌드하고 `npm link`로 다음 두 실행 파일을 전역에 연결합니다.

- `daou-gw-cli`: CLI
- `daou-gw-mcp`: stdio MCP 서버

Windows PowerShell에서 명령을 찾지 못하면 터미널을 다시 열고 확인합니다.

```powershell
Get-Command daou-gw-cli
Get-Command daou-gw-mcp
```

## 지원 경로 요약

| 환경 | 지침 | 스킬 | MCP 등록 |
|---|---|---|---|
| Codex CLI | `~/.codex/AGENTS.md` | `~/.codex/skills/` | `codex mcp add` |
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/skills/` | `claude mcp add` |
| Hermes Agent | 프로젝트 `AGENTS.md` | `~/.hermes/skills/productivity/daou-gw/` | `~/.hermes/config.yaml` |
| OpenClaw | `~/.openclaw/workspace/AGENTS.md` | `~/.openclaw/skills/daou-gw/` | `openclaw mcp add` |
| 그 외 | `~/AGENTS.md` 또는 프로젝트 지침 파일 | 에이전트별 디렉터리 | stdio 서버 `daou-gw-mcp` |

## Codex CLI

설치 스크립트는 Codex가 감지되면 `~/.codex/AGENTS.md`에 간단한 사용 안내를 추가합니다.

MCP 등록:

```bash
codex mcp add daou-gw -- daou-gw-mcp
codex mcp list
```

프로젝트별 지침은 저장소의 `AGENTS.md`를 Codex가 자동으로 읽습니다.

공식 문서:

- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Model Context Protocol](https://developers.openai.com/codex/mcp/)

## Claude Code

설치 스크립트는 Claude Code가 감지되면 `~/.claude/CLAUDE.md`에 사용 안내를 추가합니다.

MCP를 사용자 범위에 등록:

```bash
claude mcp add --scope user daou-gw -- daou-gw-mcp
claude mcp list
```

프로젝트 전용으로 제한하려면 `--scope user` 대신 `--scope project`를 사용합니다.

공식 문서:

- [How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp)

## Hermes Agent

설치 스크립트는 Hermes가 감지되면 `SKILL.md`를 다음 위치에 복사합니다.

```text
~/.hermes/skills/productivity/daou-gw/SKILL.md
```

MCP는 `~/.hermes/config.yaml`의 `mcp_servers`에 등록합니다.

```yaml
mcp_servers:
  daou-gw:
    command: "daou-gw-mcp"
    args: []
```

설치 후 Hermes에서 MCP 상태를 확인합니다.

```bash
hermes mcp
```

공식 문서:

- [Hermes configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)
- [Hermes skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
- [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)

## OpenClaw

설치 스크립트는 OpenClaw가 감지되면 다음 두 위치를 준비합니다.

```text
~/.openclaw/workspace/AGENTS.md
~/.openclaw/skills/daou-gw/SKILL.md
```

다른 워크스페이스를 사용한다면 해당 워크스페이스의 `AGENTS.md`와 `skills/`에 적용합니다.

MCP 등록과 확인:

```bash
openclaw mcp add daou-gw --command daou-gw-mcp
openclaw mcp doctor daou-gw --probe
```

공식 문서:

- [Agent workspace](https://docs.openclaw.ai/concepts/agent-workspace)
- [Skills](https://docs.openclaw.ai/tools/skills)
- [Connect MCP servers](https://docs.openclaw.ai/tools/mcp)
- [Windows via WSL2](https://docs.openclaw.ai/platforms/windows)

## 그 외 에이전트

CLI를 실행할 수 있는 에이전트라면 별도 연동 없이 사용할 수 있습니다.

1. 공통 설치를 실행합니다.
2. 에이전트의 전역 또는 프로젝트 지침 파일에 저장소의 `AGENTS.md` 내용을 참고하도록 적습니다.
3. MCP를 지원한다면 다음 stdio 서버를 등록합니다.

```text
name: daou-gw
command: daou-gw-mcp
args: []
transport: stdio
```

MCP를 지원하지 않으면 `daou-gw-cli <command> --json`을 호출해 구조화된 결과를 받습니다.
플래그는 추측하지 말고 `daou-gw-cli <command> --help`로 확인합니다.
