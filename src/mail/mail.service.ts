import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

const RESEND_API_URL = 'https://api.resend.com/emails';

const EMAIL_PATTERN = /[^\s@()<>"']+@[^\s@()<>"']+/g;
const MAX_REASON_LENGTH = 300;
const SEND_TIMEOUT_MS = 10_000;

/**
 * Resend's error `name: message` for the log, e.g. "validation_error: You can
 * only send testing emails to your own email address". Email addresses are
 * masked; the body never contains the email content or the token.
 */
export function describeResendError(body: string): string {
  let reason = body;
  try {
    const parsed = JSON.parse(body) as { name?: unknown; message?: unknown };
    const parts = [parsed.name, parsed.message].filter(
      (p): p is string => typeof p === 'string' && p.length > 0,
    );
    if (parts.length) reason = parts.join(': ');
  } catch {
    // Not JSON: keep the raw text.
  }
  return reason
    .replace(EMAIL_PATTERN, '<email>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_REASON_LENGTH);
}

/**
 * Sends transactional email through Resend's HTTP API (plain `fetch`, no SDK).
 * Without `RESEND_API_KEY` / `EMAIL_FROM` sending is disabled: `send` logs a
 * warning and returns false. Never logs the message body (it holds links
 * with tokens).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.apiKey() && this.from());
  }

  async send(email: OutgoingEmail): Promise<boolean> {
    const apiKey = this.apiKey();
    const from = this.from();
    if (!apiKey || !from) {
      this.logger.warn('Email not sent: RESEND_API_KEY / EMAIL_FROM missing');
      return false;
    }

    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const reason = describeResendError(await res.text().catch(() => ''));
      this.logger.error(
        `Resend rejected an email: HTTP ${res.status}${reason ? ` — ${reason}` : ''}`,
      );
      return false;
    }
    return true;
  }

  private apiKey(): string | undefined {
    return this.config.get<string>('RESEND_API_KEY')?.trim() || undefined;
  }

  private from(): string | undefined {
    return this.config.get<string>('EMAIL_FROM')?.trim() || undefined;
  }
}
