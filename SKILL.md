---
name: daou-gw
description: Daou GW 작업은 daou-gw-cli 또는 daou-gw-mcp로만 빠르게 처리한다. 로그인, 세션, 근태, 메일, 캘린더, 전자결재 작업을 필요한 명령만 실행해 처리한다.
version: 3.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [groupware, gw, daou-office, approval, attendance, mail, calendar, cli, mcp]
    related_skills: []
---

# Daou GW CLI/MCP Workflow

## 개요

이 스킬은 Daou GW 관련 작업을 `daou-gw-cli` 또는 `daou-gw-mcp`로 처리할 때 사용한다.

대상 작업:
- 로그인 / 세션 확인
- 출근 / 퇴근 / 근태 상태 확인
- 메일 목록 확인 / 검색 / 삭제
- 캘린더 일정 조회
- 전자결재 상태 확인

기본 원칙:
- 먼저 `daou-gw-cli` 또는 `daou-gw-mcp`로 처리한다.
- 필요한 작업만 바로 실행한다.
- 실패했을 때만 세션/auth/config 상태를 확인하고 1회 재시도한다.
- 비밀번호, 쿠키, 세션 토큰 같은 민감값은 출력하지 않는다.
- 사용자 응답은 한국어로 짧고 직접적으로 한다.

## 저장 위치

Daou GW 클라이언트는 로컬 상태를 `~/.daou/` 아래에 저장한다.

주요 파일:
- `~/.daou/config.json`: 설정값
- `~/.daou/session.json`: 로그인 세션
- `~/.daou/vault.key`: 로컬 암호화 키

보안 원칙:
- password/session/cookie/token은 응답에 노출하지 않는다.
- 파일 권한은 제한적으로 유지한다.

## 빠른 실행 우선순위

사용자가 바로 동작을 요청하면 사전 탐색 없이 해당 명령으로 간다.

예:
- “출근해줘” -> `attend in`
- “퇴근해줘” -> `attend out`
- “근태 상태” -> `attend status`
- “메일 최신 5개” -> `mail list --size 5`
- “AWS 메일 찾아줘” -> `mail search --query AWS --size 20`
- “캘린더 오늘 일정” -> `calendar list ...`
- “결재 상태 확인” -> 전자결재 관련 CLI/MCP 명령

하지 말 것:
- 먼저 repo/file 탐색
- 먼저 date command 실행
- 먼저 calendar로 근태 차단 여부 확인
- 먼저 UI 상태 추측

예외:
- 명령 자체가 없거나 실패한 경우
- session/config가 깨진 경우
- 사용자가 명시적으로 소스 확인이나 수정을 요청한 경우

## CLI 사용 원칙

반복 가능한 작업은 `daou-gw-cli`를 우선 사용한다.

원칙:
- 설정은 한 번 저장하고 재사용한다.
- 세션은 `~/.daou/session.json`을 재사용한다.
- 세션이 만료되면 저장된 credential이 있을 때 자동 재로그인 후 재시도한다.
- credential이 없으면 명확한 에러로 중단한다.
- `base_url`은 매번 입력받지 않고 저장된 config 값을 재사용한다.

## MCP 사용 원칙

`daou-gw-mcp`는 CLI와 같은 동작을 제공하는 도구 표면으로 사용한다.

원칙:
- CLI와 MCP는 같은 의미의 명령/도구 이름을 사용한다.
- MCP tool은 필요한 인자만 받는다.
- 없는 인자, 잘못된 인자, 예상 밖 인자는 실행 전에 거부한다.
- zero-argument tool은 arguments 생략을 허용한다.
- file/network side effect 전에 validation 한다.

권장 tool 이름:
- `attend_status`
- `attend_in`
- `attend_out`
- `config_set`
- `config_show`
- `login`
- `session`
- `mail_list`
- `mail_search`
- `mail_delete`
- `calendar_list`
- `approval_status`

legacy alias가 이미 있으면 같은 handler로 연결한다.
예:
- `attendance_status` -> `attend_status`
- `attendance_in` -> `attend_in`
- `attendance_out` -> `attend_out`

## 근태 처리

CLI:
- `attend status`
- `attend in`
- `attend out`

MCP:
- `attend_status`
- `attend_in`
- `attend_out`

처리 원칙:
- `attend in` / `attend out`은 즉시 실행한다.
- 실행 전에 캘린더 선확인 하지 않는다.
- 실행 전에 파일 탐색하지 않는다.
- 실행 전에 시간/date probe 하지 않는다.
- Notion으로 근태 상태를 확인하지 않는다.
- 연차/반차/휴일 캘린더 이벤트로 `attend in` / `attend out`을 차단하지 않는다.
- 명령 실패나 stale session이 의심될 때만 session/auth 상태를 확인하고 1회 재시도한다.

주의:
- `attend out`은 실제 퇴근 처리여야 한다.
- dry-run placeholder면 실패로 보고 고쳐야 한다.

## 메일 처리

권장 CLI 예시:
- `mail list --size 5`
- `mail list --size 5 --json`
- `mail search --query AWS --size 20`
- `mail delete --id <mail-id> [--id <mail-id> ...]`

처리 원칙:
- 메일 목록/검색/삭제는 CLI/MCP 명령으로 처리한다.
- `--size`는 표시 개수를 제어해야 한다.
- raw payload에 mail item이 있으면 count만 출력하지 말고 실제 row를 렌더링한다.

메일이 보이지 않는다고 할 때:
1. `session --json`으로 세션 유효성을 먼저 확인한다.
2. `mail list --size 5 --json`으로 raw 결과를 확인한다.
3. formatter 문제와 실제 빈 메일함을 구분한다.

반복 알림/서비스 메일 정리:
- 사용자가 특정 서비스/알림 메일 삭제를 요청하면 추가 탐색 없이 각 키워드를 `mail search --query <keyword> --size 100 --json`으로 조회한다.
- 반환된 `messageList[].id`를 모아 `mail delete --id ... --json`으로 한 번에 삭제한다.
- 삭제 후 같은 query를 다시 검색해 `항목 수: 0` 또는 total 0을 확인한다.
- 확인 결과만 짧게 보고한다.
- 확인된 정리 키워드 예시는 `ALARM`, `ECS 스케일`, `Sentry`, `Confluence`, `DX 일일 점검`, `Jira`, `Claude`다.
- 자세한 세션별 키워드/패턴은 `references/mail-cleanup-keywords.md`를 참고한다.

삭제 원칙:
- 사용자가 완전삭제를 명확히 요청한 경우에만 영구 삭제를 수행한다.
- 삭제 후에는 결과 count 또는 재검색으로 검증한다.

## 캘린더 처리

캘린더 조회는 `calendar list`를 사용한다.

중요:
- `calendar --calendar-id ...`는 유효한 호출이 아니다.
- optional flags는 `calendar list` 뒤에 둔다.
- parser는 `calendar`에 flags가 바로 붙어도 `list`로 추론하지 않는다.

출력 원칙:
- human output은 `캘린더 일정` 제목을 사용한다.
- 날짜 범위와 item count만 간단히 보여준다.
- event ID는 출력하지 않는다.
- visible title/label 앞뒤의 `-`는 제거한다.

## 전자결재 처리

전자결재 상태는 CLI/MCP 명령으로 확인한다.

보고 원칙:
- 문서 제목
- 기안일 또는 생성일
- 현재 상태
- 진행/완료/반려/보류/취소 여부
- 필요한 만큼만 짧게 요약

상태 표현:
- `진행중`: 승인 흐름 진행 중
- `완료`: 승인/처리 완료
- `반려`: 반려됨
- `보류`: 보류됨
- `취소`: 취소됨

## 세션 자동 갱신

saved session 재사용 규칙:
1. 먼저 저장된 session을 검증한다.
2. session이 유효하면 그대로 명령을 실행한다.
3. session이 만료됐고 credential이 있으면 자동 재로그인한다.
4. 새 session을 저장한다.
5. 원래 명령을 1회 재시도한다.
6. credential이 없으면 명확한 에러로 중단한다.

주의:
- 재시도는 무한 반복하지 않는다.
- 실패 원인은 짧게 보고한다.
- 민감값은 출력하지 않는다.

## 관련 reference

필요할 때만 참고한다.
- `references/server-notification-mail-cleanup.md`: ALARM / ECS 스케일 / Sentry 같은 서버 알림 메일 검색-삭제-검증 패턴
- `references/mail-cleanup-keywords.md`: 반복 알림/서비스 메일 키워드와 삭제 검증 패턴

## 검증 체크리스트

- [ ] 요청 작업을 CLI/MCP로 먼저 처리했는가
- [ ] 불필요한 파일 탐색을 하지 않았는가
- [ ] 근태 요청에서 캘린더 선확인을 하지 않았는가
- [ ] 세션이 stale이면 1회 재로그인/재시도했는가
- [ ] 민감값을 출력하지 않았는가
- [ ] 작업 결과를 짧고 직접적으로 보고했는가

## 버전 정책

- semantic versioning을 사용한다.
- 문구나 안전장치 수정은 patch version을 올린다.
- 작업 흐름 변경은 minor version을 올린다.
- 불필요한 구현/브라우저/엔드포인트 설명 제거처럼 스킬 목적이 크게 바뀌면 major version을 올린다.
- 현재 버전은 frontmatter의 `version:` 필드에 유지한다.
