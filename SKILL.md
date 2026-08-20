---
name: daou-gw
description: Daou GW 작업은 daou-gw-cli 또는 daou-gw-mcp로만 처리. 로그인, 세션, 근태, 메일, 캘린더, 전자결재, 게시판.
version: 4.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [groupware, gw, daou-office, approval, attendance, mail, calendar, cli, mcp]
    related_skills: []
---

# Daou GW CLI

모든 작업은 daou-gw-cli로 즉시 실행. 사전 탐색·date·캘린더 확인 금지. 세션 만료는 CLI가 자동 재로그인하므로 선확인 불필요. 민감값 출력 금지.

## 명령

| 작업 | CLI | JSON data path |
|------|-----|----------------|
| 근태상태 | `attend status` | leave, clockedIn, clockedOut |
| 근태현황 | `attend history [--month YYYY-MM]` | days[], totals, counts |
| 조직도 | `org tree` | 트리 |
| 직원검색 | `org search --query <q> [--refresh]` | employees[] |
| 일정요약 | `calendar summary [--range today\|day\|week\|month] [--date YYYY-MM-DD]` | data[] |
| 출근 | `attend in` | status: done/already/skip |
| 퇴근 | `attend out` | status: done/already/skip |
| 메일목록 | `mail list --size N` | data.messageList[] |
| 메일검색 | `mail search --query <q> --size N` | data.messageList[] |
| 메일삭제 | `mail delete --id X [--id Y ...]` | – |
| 메일발송 | `mail send --to <a> --subject <s> --content <html>` | 응답 code/data |
| 캘린더 | `calendar list [--from-date YYYY-MM-DD] [--to-date YYYY-MM-DD]` | data[].title, startTime |
| 결재할일 | `approval todo [--size N]` | data[] |
| 결재참조 | `approval reference [--size N]` | data[] |
| 결재건수 | `approval count` | count |
| 연차 | `leavecount` | 사용/잔여/추가/총연차 |
| 양식검색 | `approval form-search --query <q>` | form id |
| 양식목록 | `approval forms` | 폴더/양식 트리 |
| 결재작성 | `approval draft --form-id <id> [--title <t>] [--content <html>]` | 임시저장 문서 id |
| 문서조회 | `approval document --document-id <id>` | docStatus, title |
| 문서함 | `approval box --kind draft\|tempsave\|approve\|viewer\|reception\|send\|official` | data[], page.total |
| 게시글작성 | `board create --board-id <id> --subject <t> --content <html>` | data.id |
| 게시글수정 | `board update --board-id <id> --post-id <id> --subject <t> --content <html>` | data.id |
| 게시글첨부 | `board attach --board-id <id> --post-id <id> --file <path>` | attachId |

**주의**:
- approval은 `list`가 아님. `todo`/`reference`/`count`만 있음.
- calendar는 `--date`가 없음. `--from-date` / `--to-date`를 쓸 것. 생략하면 오늘부터 7일.
- 근태 명령은 `attend` 설정이 켜져 있을 때만 존재. 없으면 `config set --attend`로 켤 것.

플래그가 기억나지 않으면 추측하지 말고 `daou-gw-cli <명령> --help`로 확인. 도움말은 실제 스키마에서 생성되므로 항상 정확함.

## 근태

즉시 실행. 선확인 전면 금지. 연차/반차/휴일이면 CLI가 스스로 `건너뜀`을 반환하므로 사전 캘린더 조회 불필요.
월 단위 확인은 `attend history`. 미래 날짜는 집계에서 자동 제외되므로 결근 수치를 그대로 신뢰해도 됨.

## 전자결재 작성

`form-search`로 form id를 먼저 확보한 뒤 `approval draft`. **임시저장까지만 가능하고 상신 기능은 없다.** 상신이 필요하면 사용자에게 그룹웨어 화면에서 하라고 안내할 것.
`--dept-id` 생략 시 조직도에서 기안부서 자동 판별. `--content` 생략 시 양식 서식 유지.

## 조직도 / 직원

- `org search`는 이름·부서·직위·이메일·사번·전화 전부를 훑음. 부서로 찾으려면 부서명을 그대로 query에 넣을 것
- 디렉터리는 24시간 로컬 캐시. 인사이동 직후라면 `--refresh`
- 캐시가 살아 있으면 네트워크 없이 응답하므로 반복 검색이 빠름

## 메일

- `mail search ... --json` → `data.messageList[].id` 수집 → `mail delete --id ... --id ...` 일괄
- 이미지 본문은 `--image <path>`. 업로드 후 `<img>`로 삽입됨
- 예약 발송은 `--reserved-at <iso>`
- 발신자 우선순위: `--from-email` → config `mail_sender_email` → env `DAOU_MAIL_SENDER_EMAIL` → username
- 삭제 후 재검색으로 0건 확인
- JSON 장문은 `/tmp/*.json` 리다이렉트 후 파싱

## 게시판

- HTML 이미지: `src="[{/절대경로/파일.png}]"` → `/api/file` 업로드 + src 자동치환. Windows 경로도 가능
- 이미지는 인라인, 그 외 파일은 첨부, `.mp4`는 게시 후 영구 첨부 URL로 재치환
- 생성 후 검증: `GET /api/board/{boardId}/post/{postId}`에서 `data-id=`, `/thumb/` 확인
- 전체 본문 대신 제목 + 이미지 치환 여부만 체크

## MCP

`daou-gw-mcp` (stdio). 툴 이름은 CLI 명령과 1:1 대응하며 `_`로 연결됨: `mail_list`, `approval_leave_count`, `board_post_create` 등.
근태 툴(`attend_status`/`attend_in`/`attend_out`)은 `attend` 설정이 꺼져 있으면 목록에 없고 호출 시 `unknown tool`.
