<div align="center">

# daou-gw-cli

**Daou Office 그룹웨어를 터미널과 AI 에이전트에서 그대로 쓰기**

하나의 정의에서 CLI 명령과 MCP 툴이 동시에 만들어집니다.

![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF)
![Tools](https://img.shields.io/badge/tools-28-0EA5E9)
![Tests](https://img.shields.io/badge/tests-58%20passing-22C55E)

</div>

> [!NOTE]
> 비공식 도구입니다. Daou의 공식 배포물도, 공식 지원 제품도 아닙니다.

---

## 한눈에 보기

| | 기능 | 대표 명령 |
|:--:|---|---|
| 📧 | 메일 목록·검색·삭제·발송 | `mail search --query AWS` |
| 📋 | 전자결재 조회 · 문서함 7종 | `approval box --kind tempsave` |
| ✍️ | 결재 양식 검색 · 문서 임시저장 | `approval draft --form-id 5374` |
| 📅 | 캘린더 조회 · 기간별 요약 | `calendar summary --range week` |
| 🏢 | 조직도 · 직원 검색 (로컬 캐시) | `org search --query 개발3파트` |
| 📌 | 게시판 작성·수정·첨부 | `board create --board-id 1 ...` |
| 🕘 | 근태 출퇴근 · 월간 현황 *(선택 노출)* | `attend history` |
| 🔌 | MCP 서버 (stdio) | `daou-gw-mcp` |

<br>

## 목차

- [설치](#설치)
- [빠른 시작](#빠른-시작)
- [명령어](#명령어)
- [MCP 서버](#mcp-서버)
- [설정과 저장 위치](#설정과-저장-위치)
- [구조](#구조)
- [기능 추가하는 법](#기능-추가하는-법)
- [개발](#개발)

<br>

## 설치

```bash
npm install
npm run build
```

에이전트 환경(전역 링크 · Hermes skill · `AGENTS.md`)에 한 번에 설치:

```bash
bash scripts/install-agent.sh
```

설치 확인:

```bash
daou-gw-cli session
```

> **요구사항** — Node.js 20 이상, npm, Daou Office 계정

<br>

## 빠른 시작

```bash
# 1) 기본 설정
daou-gw-cli config set --base-url https://gw.example.com --username <아이디> --password <비밀번호>

# 2) 로그인
daou-gw-cli login --username <아이디> --password <비밀번호>

# 3) 확인
daou-gw-cli session
```

> [!TIP]
> 세션이 만료되면 저장된 자격 증명으로 **자동 재로그인 후 1회 재시도**합니다. 평소 사용에서 재로그인은 필요 없습니다.

<br>

## 명령어

모든 명령은 `--json`으로 원본 응답을 출력합니다.
플래그가 기억나지 않으면 추측하지 말고 `daou-gw-cli <명령> --help` — 도움말은 실제 스키마에서 생성되므로 항상 정확합니다.

### 📧 메일

```bash
daou-gw-cli mail list   [--folder Inbox] [--page 1] [--size 20]
daou-gw-cli mail search --query <text> [--folder Inbox] [--page 1] [--size 20]
daou-gw-cli mail delete --id <mail-id> [--id <mail-id> ...] [--folder Inbox]
daou-gw-cli mail send   --to <email[,email...]> --subject <text> \
                        (--content <html> | --html-file <path> | --image <path>) \
                        [--cc <email>] [--bcc <email>] [--from-email <email>] [--reserved-at <iso>]
```

- 발신자 주소 우선순위: `--from-email` → 설정 `mail_sender_email` → `DAOU_MAIL_SENDER_EMAIL` → `username`
- `--image`는 업로드 후 본문에 `<img>`로 삽입되고, `--reserved-at`을 주면 예약 발송으로 전환됩니다.

### 📋 전자결재 조회

```bash
daou-gw-cli approval todo      [--type all|wait|hold] [--keyword <text>] [--from-date YYYY-MM-DD]
daou-gw-cli approval reference [--kind reference|read|view]
daou-gw-cli approval count
daou-gw-cli approval box       [--kind <문서함>] [--page 1] [--size 20] [--keyword <text>]
daou-gw-cli approval document  --document-id <id>
daou-gw-cli leavecount
```

`approval box`는 그룹웨어 문서함을 그대로 엽니다.

| `--kind` | 문서함 | | `--kind` | 문서함 |
|---|---|:--:|---|---|
| `draft` *(기본)* | 기안문서 | | `send` | 발송문서 |
| `tempsave` | 임시문서 | | `official` | 공문문서 |
| `approve` | 결재문서 | | `reception` | 수신문서 |
| `viewer` | 참조/열람문서 | | | |

함마다 정렬 기준이 다르며 CLI가 알아서 맞춥니다. 수신·임시 문서함은 날짜 범위 필터를 지원하지 않습니다.
`leavecount`는 사용/잔여/추가/총 연차를 출력합니다.

### ✍️ 전자결재 작성

```bash
# 1) 양식 찾기
daou-gw-cli approval form-search --query 연차
#    2. 근태 > 연차신청-연차관리연동 (form 5374)

# 2) 임시저장 문서 만들기
daou-gw-cli approval draft --form-id 5374 --title "8월 연차"

# 3) 임시문서함에서 확인
daou-gw-cli approval box --kind tempsave
```

> [!IMPORTANT]
> `draft`는 **임시저장까지만** 합니다. 상신(결재 올리기) 기능은 의도적으로 넣지 않았습니다.
> 이어서 작성하고 올리는 것은 그룹웨어 화면에서 하세요.

- `--dept-id`를 생략하면 조직도에서 본인 기안부서를 자동으로 찾습니다.
- `--content`를 생략하면 양식 서식이 그대로 유지됩니다. 양식 변수는 `--variables`로 채웁니다.
- 전체 양식 목록은 `daou-gw-cli approval forms`.

### 📅 캘린더

```bash
daou-gw-cli calendar list    [--calendar-id <id[,id...]>] [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]
daou-gw-cli calendar summary [--range today|day|week|month] [--date YYYY-MM-DD]
```

- `--calendar-id`를 생략하면 내 캘린더 전체. 날짜를 생략하면 오늘부터 7일. 모든 날짜는 KST 기준입니다.
- `summary`는 건수·종일/시간지정 구분·캘린더별 집계·일자별 목록을 출력합니다. 주간은 월\~일, 월간은 1일\~말일.
- 휴일 캘린더가 범위 밖 일정까지 반환하므로 `summary`는 범위 밖 항목을 잘라냅니다.

### 🏢 조직도 · 직원

```bash
daou-gw-cli org tree   [--members]
daou-gw-cli org search [--query <text>] [--limit 20] [--refresh]
```

```
조직도
+ 이지스엔터프라이즈 (#10)
  + 대표이사 (#204)
    + 사장 (#206)
      + IT본부 (#80)
        + ERP개발팀 (#81)
          + 개발3파트 (#159)
```

- `search`는 이름·부서·직위·이메일·사번·전화번호를 한 번에 훑습니다.
- 직원 목록은 `~/.daou/directory.json`에 24시간 캐시됩니다. **캐시가 살아 있으면 네트워크 없이** 검색하고, `--refresh`로 강제 갱신합니다.

### 📌 게시판

```bash
daou-gw-cli board create --board-id <id> --subject <text> --content <html>
daou-gw-cli board update --board-id <id> --post-id <id> --subject <text> --content <html>
daou-gw-cli board attach --board-id <id> --post-id <id> --file <path>
```

HTML 본문에서 로컬 파일을 이렇게 참조하면 자동 업로드 후 `src`가 치환됩니다.

```html
<img src="[{/absolute/path/image.png}]" alt="...">
```

Windows 경로(`C:\...`)도 그대로 씁니다. 이미지는 인라인으로, 그 외 파일은 첨부로 올라가며 `.mp4`는 게시 후 영구 첨부 URL로 다시 치환됩니다.

### 🕘 근태

> [!WARNING]
> 근태 기능은 **기본적으로 숨겨져 있습니다.** 켜야 CLI 명령과 MCP 툴 목록에 나타납니다.

```bash
daou-gw-cli config set --attend          # 켜기
daou-gw-cli config set --attend false    # 끄기

daou-gw-cli attend status
daou-gw-cli attend in
daou-gw-cli attend out
daou-gw-cli attend history [--month YYYY-MM]
```

- `history`는 월간 근태표입니다. 일자별 출퇴근 시각·근무시간, 지각·조퇴·결근·휴일 집계, 월 합계를 보여줍니다. 아직 오지 않은 날짜는 집계에서 제외합니다.
- 연차·반차 일정이 캘린더에 있거나 휴일이면 출퇴근 호출을 스스로 건너뜁니다.
- 일회성 노출은 맨 앞에 `--attend`: `daou-gw-cli --attend attend status`

<br>

## MCP 서버

```bash
daou-gw-mcp
```

stdio 트랜스포트로 동작합니다. 각 툴의 `inputSchema`는 CLI 플래그와 **같은 정의에서 생성**되므로 두 표면이 어긋나지 않습니다.

<details>
<summary><b>제공 툴 28개</b></summary>

<br>

| 도메인 | 툴 |
|---|---|
| 설정·인증 | `config_show` `config_set` `login` `session` |
| 메일 | `mail_list` `mail_search` `mail_delete` `mail_send` |
| 캘린더 | `calendar_list` `calendar_summary` |
| 전자결재 | `approval_todo` `approval_reference` `approval_count` `approval_leave_count` `approval_box` `approval_document` |
| 결재 작성 | `approval_form_tree` `approval_form_search` `approval_draft_create` |
| 게시판 | `board_post_create` `board_post_update` `board_post_attach` |
| 조직 | `org_tree` `org_search` |
| 근태 *(선택)* | `attend_status` `attend_in` `attend_out` `attend_history` |

근태 툴은 `attend` 설정이 꺼져 있으면 목록에 나오지 않고, 호출해도 `unknown tool`입니다.

</details>

<br>

## 설정과 저장 위치

| 파일 | 내용 |
|---|---|
| `~/.daou/config.json` | 설정 (비밀번호는 `aes-256-gcm` 암호화) |
| `~/.daou/session.json` | 세션 쿠키 |
| `~/.daou/vault.key` | 비밀번호 암호화 키 |
| `~/.daou/directory.json` | 직원 디렉터리 캐시 (24시간) |

<details>
<summary><b>환경변수</b> — 설정 파일에 값이 없을 때만 사용되는 폴백</summary>

<br>

**저장된 설정이 항상 우선입니다.**

| 환경변수 | 대응 설정 |
|---|---|
| `DAOU_BASE_URL` | `base_url` |
| `DAOU_USERNAME` | `username` |
| `DAOU_PASSWORD` | `password` |
| `DAOU_ATTEND` | `attend` (근태 기능 노출) |
| `DAOU_MAIL_LIST_URL` | `mail_list_url` |
| `DAOU_MAIL_SEARCH_URL` | `mail_search_url` |
| `DAOU_MAIL_DELETE_URL` | `mail_delete_url` |
| `DAOU_MAIL_SEND_URL` | `mail_send_url` |
| `DAOU_MAIL_IMAGE_UPLOAD_URL` | `mail_image_upload_url` |
| `DAOU_MAIL_SENDER_EMAIL` | `mail_sender_email` |
| `DAOU_MAIL_SENDER_NAME` | `mail_sender_name` |
| `DAOU_BOARD_CREATE_URL` | `board_create_url` |
| `DAOU_BOARD_UPDATE_URL` | `board_update_url` |
| `DAOU_BOARD_ATTACH_URL` | `board_attach_url` |
| `DAOU_BOARD_IMAGE_UPLOAD_URL` | `board_image_upload_url` |

</details>

<br>

## 구조

```
src/
├── core/       설정 · 저장 · HTTP · 세션 · 시간 · 오퍼레이션 레지스트리
├── api/        그룹웨어 HTTP 호출 (mail, calendar, approval, board, attendance, organization)
├── render/     사람이 읽는 한국어 출력
├── ops/        기능 정의 = 스키마 + 실행 + 렌더 연결
├── surfaces/   ops로부터 CLI와 MCP 서버를 생성
└── tests/
```

핵심은 **`src/ops/`** 입니다. 기능 하나가 오퍼레이션 하나로 정의되고, CLI 명령과 MCP 툴은 거기서 자동 생성됩니다. 같은 기능을 CLI와 MCP에 두 번 배선하지 않습니다.

<br>

## 기능 추가하는 법

**1.** 필요하면 `src/api/`에 HTTP 호출을, `src/render/`에 출력 포맷을 추가합니다.

**2.** `src/ops/<도메인>.ts`에 오퍼레이션을 정의합니다.

```ts
export const mailList = defineOperation({
  id: 'mail.list',              // 내부 식별자
  tool: 'mail_list',            // MCP 툴 이름
  cli: ['mail', 'list'],        // CLI 경로 → daou-gw-cli mail list
  summary: 'List mail using the saved session',
  input: z.strictObject({       // CLI 플래그와 MCP 스키마가 여기서 생성됨
    folder: z.string().optional().describe('Mail folder'),
    size: z.number().int().min(1).default(20).describe('Items per page'),
  }),
  auth: true,                   // 세션 필요 (만료 시 자동 재로그인)
  run: async (ctx, input) => ({ data, text }),
});
```

**3.** `src/ops/index.ts`의 `OPERATIONS`에 추가합니다.

끝입니다. CLI 플래그, `--help`, MCP `inputSchema`, 인자 검증이 전부 따라옵니다.

<details>
<summary><b>부가 옵션</b></summary>

<br>

| 필드 | 용도 |
|---|---|
| `hidden` | 설정에 따라 두 표면 모두에서 숨김 *(근태가 사용)* |
| `schemaExtra` | zod로 표현 못 하는 JSON Schema 조각 (`anyOf` 등) |
| `cliAlias` | 생성될 플래그 이름 변경 (`sender_email` → `--from-email`) |
| `cliHidden` | CLI 플래그를 만들지 않을 속성 |
| `cliExtras` | CLI 전용 편의 옵션 (`--html-file` 등) |

설정 항목을 추가할 때는 `src/core/config.ts`의 `CONFIG_FIELDS`에 **한 줄만** 넣으면 `config set` 플래그, `config_set` MCP 인자, `DAOU_*` 환경변수 폴백이 함께 생깁니다.

</details>

<br>

## 개발

```bash
npm run dev          # CLI
npm run dev:mcp      # MCP 서버
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run build        # tsup
```

빌드 산출물(`dist/`)은 저장소에 커밋하지 않습니다. 설치 시 `npm run build`로 생성됩니다.

<br>

---

## 라이선스 및 권리 고지

별도의 오픈소스 라이선스는 두지 않습니다. 배포·사용·재배포는 Daou의 정책과 라이선스를 따릅니다.

코드 권한을 제외한 모든 권리(상표, 서비스, 데이터, UI, API, 문서, 운영 정책 등)는 Daou에 귀속됩니다.

Daou의 명시적 허가 없이 이 프로젝트를 공식 제품·공식 문서·공식 지원으로 오인해서는 안 됩니다.

요청이 있으면 프로젝트는 삭제될 수 있습니다.
