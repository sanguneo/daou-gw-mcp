---
name: daou-gw
description: Daou GW 작업은 daou-gw-cli 또는 daou-gw-mcp로만 처리. 로그인, 세션, 근태, 메일, 캘린더, 전자결재, 게시판.
version: 3.4.3
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [groupware, gw, daou-office, approval, attendance, mail, calendar, cli, mcp]
    related_skills: []
---

# Daou GW CLI

모든 작업은 daou-gw-cli로 즉시 실행. 사전 탐색·date·캘린더 확인 금지. session valid면 곧장 명령. staled면 자동 재로그인 1회 재시도. 민감값 출력 금지.

## 명령

| 작업 | CLI | JSON data path |
|------|-----|----------------|
| 출근 | `attend in` | – |
| 퇴근 | `attend out` | – |
| 근태상태 | `attend status` | leave, clockedIn, clockedOut |
| 메일목록 | `mail list --size N` | data.messageList[] |
| 메일검색 | `mail search --query <q> --size N` | data.messageList[] |
| 메일삭제 | `mail delete --id X` | – |
| 메일발송 | `mail send --to <email> --subject <text> (--content <html>|--html-file <path>|--image <path>)` | 응답 code/data |
| 캘린더 | `calendar list [--date YYYY-MM-DD]` | data[].summary, startTime, calendarName |
| 결재할일 | `approval todo [--size N]` | data[] |
| 결재참조 | `approval reference [--size N]` | data[] |
| leavecount | `leavecount` | 사용/잔여/추가/총연차 출력 |
| 게시글수정 | `board update ... --content <html>` | data.id |

**주의**: approval은 `list`가 아님. `todo`/`reference`/`count`만 있음.

## 근태

즉시 실행. 선확인 전면 금지. 실패 시만 session 확인 후 1회 재시도.

## 메일

- `... --json` → messageList[].id 수집 → `mail delete --id ...` 일괄
- 발송은 `mail send --to ... --subject ... --content ...` 사용. 이미지 본문은 `--image <path>`를 주면 `/api/mail/image/upload` 후 `/api/mail/message/send`로 보낸다.
- 예약은 `--reserved-at <iso>` 사용. 발신자 메일은 `--from-email`, config `mail_sender_email`, env `DAOU_MAIL_SENDER_EMAIL`, username 순서.
- 삭제 후 재검색 0건 확인
- AWS ALARM 등 JSON 장문 시 `/tmp/*.json` 리다이렉트 후 파싱

## 게시판

- HTML 이미지: `src="[{/절대경로/파일.png}]"` → CLI가 `/api/file` 업로드 + src 자동치환
- Windows 경로도 입력 가능
- 생성 후 검증: `GET /api/board/{boardId}/post/{postId}` 응답에서 `<img data-id=`, `/thumb/` 확인
- 전체 게시글 내용 확인은 full body 보단 제목 + 이미지 치환 여부만 체크
