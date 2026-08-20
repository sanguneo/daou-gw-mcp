import { formatStamp } from '../core/time.js';
import type { Config, Session } from '../core/types.js';
import { dash, lines } from './common.js';

export function formatConfig(cfg: Config): string {
  const out = [
    'Daou GW 설정',
    `- Username: ${dash(cfg.username)}`,
    `- Password: ${cfg.password?.trim() ? '저장됨' : '미저장'}`,
  ];
  if (cfg.base_url) {
    out.push(`- Base URL: ${cfg.base_url}`);
  } else {
    out.push('- Base URL: 없음', '- 경고: 로그인할 때 --base-url를 넣어줘');
  }
  if (cfg.leave_form_id) out.push(`- Leave Form ID: ${cfg.leave_form_id}`);
  if (cfg.leave_dept_id) out.push(`- Leave Department ID: ${cfg.leave_dept_id}`);

  const mailKeys = [
    ['Mail List URL', cfg.mail_list_url],
    ['Mail Search URL', cfg.mail_search_url],
    ['Mail Delete URL', cfg.mail_delete_url],
    ['Mail Send URL', cfg.mail_send_url],
    ['Mail Image Upload URL', cfg.mail_image_upload_url],
    ['Mail Sender Email', cfg.mail_sender_email],
    ['Mail Sender Name', cfg.mail_sender_name],
  ] as const;
  if (mailKeys.some(([, value]) => value)) {
    for (const [label, value] of mailKeys) out.push(`- ${label}: ${dash(value)}`);
  }

  const boardKeys = [
    ['Board Create URL', cfg.board_create_url],
    ['Board Update URL', cfg.board_update_url],
    ['Board Attach URL', cfg.board_attach_url],
    ['Board Image Upload URL', cfg.board_image_upload_url],
  ] as const;
  if (boardKeys.some(([, value]) => value)) {
    for (const [label, value] of boardKeys) out.push(`- ${label}: ${dash(value)}`);
  }

  if (cfg.saved_at) out.push(`- 저장시각: ${formatStamp(cfg.saved_at)}`);
  return lines(...out);
}

export function formatSession(session: Session, valid?: boolean): string {
  const out = [
    'Daou GW 세션',
    `- User ID: ${session.user_id ?? '-'}`,
    `- Username: ${dash(session.username)}`,
    `- Base URL: ${dash(session.base_url)}`,
    `- Cookies: ${session.cookies?.length ?? 0}개`,
  ];
  if (valid !== undefined) out.push(`- 상태: ${valid ? 'valid' : 'invalid'}`);
  if (session.saved_at) out.push(`- 저장시각: ${formatStamp(session.saved_at)}`);
  return lines(...out);
}
