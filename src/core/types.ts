/**
 * Shared data shapes. Everything persisted to `~/.daou` lives here.
 */

/** Local config saved at `~/.daou/config.json`. Password is encrypted at rest. */
export interface Config {
  base_url?: string;
  username?: string;
  password?: string;
  leave_form_id?: string;
  leave_dept_id?: string;
  mail_list_url?: string;
  mail_search_url?: string;
  mail_delete_url?: string;
  mail_send_url?: string;
  mail_image_upload_url?: string;
  mail_sender_email?: string;
  mail_sender_name?: string;
  /** `auto` (SMTP, then web API), `smtp` or `web`. */
  mail_transport?: string;
  smtp_host?: string;
  smtp_port?: string;
  imap_port?: string;
  board_create_url?: string;
  board_update_url?: string;
  board_attach_url?: string;
  board_image_upload_url?: string;
  /**
   * Allow an expired session to be refreshed with the saved password.
   * The groupware keeps a single session per user, so a password login logs
   * every other client (browser, messenger, phone) out. Off by default.
   */
  auto_login?: boolean;
  /** Electron messenger store used to borrow a live SSO token. */
  messenger_config_path?: string;
  saved_at?: string;
}

export interface SavedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;
  secure?: boolean;
  http_only?: boolean;
}

/** Session saved at `~/.daou/session.json`. */
export interface Session {
  user_id?: number;
  cookies?: SavedCookie[];
  saved_at?: string;
  username?: string;
  base_url?: string;
  last_check?: string;
}

export interface AttendanceStatus {
  userId: number;
  today: string;
  leave: string;
  holiday: boolean;
  leaveEvent?: string;
  leaveSource?: 'calendar';
  clockedIn: boolean;
  clockedOut: boolean;
}

export interface AttendanceActionResult {
  ok: boolean;
  action: 'in' | 'out';
  userId: number;
  today: string;
  status: 'done' | 'already' | 'skip';
  reason?: 'leave_or_holiday' | 'not_clocked_in';
  blockedBy?: string;
}
