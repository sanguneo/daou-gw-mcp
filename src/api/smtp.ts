import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import type { Config } from '../core/types.js';

export interface SmtpSettings {
  host: string;
  port: number;
  imapPort: number;
  user: string;
  pass: string;
}

export interface SmtpMessage {
  from: string;
  fromName?: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  readReceipt?: boolean;
  saveSent?: boolean;
}

function port(value: string | undefined, fallback: number): number {
  const parsed = Number(value?.trim() || fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * SMTP settings derived from config: the groupware host itself on port 25
 * (STARTTLS) unless overridden. Null when there is no saved password to log in with.
 */
export function smtpSettings(cfg: Config, baseUrl: string, from: string): SmtpSettings | null {
  const pass = cfg.password?.trim();
  if (!pass) return null;
  let host = cfg.smtp_host?.trim() ?? '';
  if (!host) {
    try {
      host = new URL(baseUrl).hostname;
    } catch {
      return null;
    }
  }
  const user = from || cfg.username?.trim() || '';
  if (!host || !user) return null;
  return { host, port: port(cfg.smtp_port, 25), imapPort: port(cfg.imap_port, 993), user, pass };
}

/** SMTP does not file a copy in Sent the way the web API does, so append it over IMAP. */
async function appendToSent(settings: SmtpSettings, raw: Buffer): Promise<void> {
  const client = new ImapFlow({
    host: settings.host,
    port: settings.imapPort,
    secure: true,
    auth: { user: settings.user, pass: settings.pass },
    logger: false,
  });
  await client.connect();
  try {
    await client.append('Sent', raw, ['\\Seen']);
  } finally {
    await client.logout();
  }
}

export async function sendViaSmtp(settings: SmtpSettings, message: SmtpMessage): Promise<string> {
  const built = await nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail({
    from: message.fromName ? { name: message.fromName, address: message.from } : message.from,
    to: message.to,
    cc: message.cc || undefined,
    bcc: message.bcc || undefined,
    subject: message.subject,
    html: message.html,
    headers: message.readReceipt ? { 'Disposition-Notification-To': message.from } : undefined,
  });
  const raw = built.message as Buffer;

  const transport = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465,
    requireTLS: settings.port !== 465,
    auth: { user: settings.user, pass: settings.pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
  let info;
  try {
    info = await transport.sendMail({ envelope: built.envelope, raw });
  } finally {
    transport.close();
  }

  const result: Record<string, unknown> = {
    ok: true,
    transport: 'smtp',
    endpoint: `smtp://${settings.host}:${settings.port}`,
    messageId: built.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
  };
  if (message.saveSent !== false) {
    try {
      await appendToSent(settings, raw);
      result.savedSent = true;
    } catch (err) {
      result.savedSent = false;
      result.saveSentError = err instanceof Error ? err.message : String(err);
    }
  }
  return JSON.stringify(result);
}
