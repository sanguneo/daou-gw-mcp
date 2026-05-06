export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface Config {
  base_url?: string;
  username?: string;
  password?: string;
  attend?: boolean;
  mail_list_url?: string;
  mail_search_url?: string;
  mail_delete_url?: string;
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
