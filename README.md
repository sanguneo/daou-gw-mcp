# daou-gw-cli

Daou Office 그룹웨어(`gw.aegisep.com`)를 위한 CLI/MCP 도구입니다.

이 프로젝트는 비공식 도구입니다. Daou의 공식 배포물이나 공식 지원 제품이 아닙니다.

- 로그인 세션 저장/검증
- 메일 목록/검색/삭제
- 전자결재(todo/reference/count)
- 캘린더 일정 조회
- MCP 서버 제공

## 요구사항

- Node.js 20 이상
- `npm`
- Daou Office 계정 접근 권한

## 설치

```bash
npm install
npm run build
```

빌드 후 실행 파일은 `dist/`에 생성됩니다.

- `daou-gw-cli`
- `daou-gw-mcp`

## 저장 위치

설정과 세션은 사용자 홈의 `~/.daou/` 아래에 저장됩니다.

- `~/.daou/config.json`
- `~/.daou/session.json`
- `~/.daou/cookies.json`
- `~/.daou/endpoints.json`
- `~/.daou/vault.key`

비밀번호는 `aes-256-gcm`으로 암호화되어 저장됩니다.

## 빠른 시작

### 1) 기본 설정 저장

```bash
daou-gw-cli config set \
  --base-url https://gw.aegisep.com \
  --username <아이디> \
  --password <비밀번호>
```

### 2) 로그인

```bash
daou-gw-cli login --username <아이디> --password <비밀번호>
```

`--base-url`를 이미 설정해 두었다면 생략할 수 있습니다.

### 3) 세션 확인

```bash
daou-gw-cli session
```

## 명령어

### help

```bash
daou-gw-cli help
```

### config

```bash
daou-gw-cli config show
daou-gw-cli config set [--base-url <url>] [--username <id>] [--password <pw>]
```

### login

```bash
daou-gw-cli login --username <id> --password <pw> [--base-url <url>] [--json]
```

### session

```bash
daou-gw-cli session [--json]
```

세션 유효성만 확인합니다.

### mail

```bash
daou-gw-cli mail list [--folder Inbox] [--page 1] [--size 20] [--json]
daou-gw-cli mail search --query <text> [--folder Inbox] [--page 1] [--size 20] [--json]
daou-gw-cli mail delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox] [--json]
```

기본 동작:

- `--folder` 미지정 시 `Inbox`
- `--size`는 표시 개수에도 반영됩니다.
- `search`는 `--query`가 필수입니다.
- `delete`는 `--id`를 하나 이상 넣어야 합니다.

### approval

```bash
daou-gw-cli approval todo [--type all|wait|hold] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]
daou-gw-cli approval reference [--kind reference|read|view] [--page 1] [--size 20] [--searchtype <type>] [--keyword <text>] [--duration all|period] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]
daou-gw-cli approval count [--json]
```

### calendar

```bash
daou-gw-cli calendar list [--calendar-id <id[,id...]>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD] [--json]
```

주의:

- `calendar`는 현재 `list`만 지원합니다.
- `calendar-id`를 생략하면 내 캘린더 목록의 전체 ID를 사용합니다.
- 날짜는 KST 기준으로 처리합니다.

## MCP 서버

```bash
daou-gw-mcp
```

지원 도구 예시:

- `config_show`
- `config_set`
- `login`
- `session`
- `mail_list`
- `mail_search`
- `mail_delete`
- `calendar_list`
- `approval_todo`
- `approval_reference`
- `approval_count`

## 출력 형식

기본 출력은 사람이 읽기 쉬운 한국어 요약입니다. 필요하면 `--json`을 붙여 원본 응답을 볼 수 있습니다.

예시:

```bash
daou-gw-cli mail list --size 5 --json
daou-gw-cli approval count --json
daou-gw-cli calendar list --from-date 2026-05-01 --to-date 2026-05-07
```

## 구현 메모

- 메일/결재/캘린더는 저장된 세션을 재사용합니다.
- 세션이 만료되면 저장된 자격 증명으로 자동 재로그인할 수 있습니다.
- 설정 파일의 `base_url`이 우선이며, 로그인/세션/메일/결재/캘린더가 이를 공유합니다.

## 개발

```bash
npm run dev
npm run dev:mcp
npm test
npm run typecheck
npm run build
```

## 라이선스 및 권리 고지

별도의 오픈소스 라이선스는 두지 않습니다. 배포/사용/재배포는 Daou의 정책과 라이선스를 따릅니다.

코드 권한을 제외한 모든 권리(상표, 서비스, 데이터, UI, API, 문서, 운영 정책 등)는 Daou에 귀속됩니다.

Daou의 명시적 허가 없이 이 프로젝트를 공식 제품, 공식 문서, 공식 지원으로 오인해서는 안 됩니다.
