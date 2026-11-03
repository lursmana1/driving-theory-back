import { createHash, randomBytes } from 'node:crypto';
import {
  PASSWORD_RESET_PAGE_PATH,
  PASSWORD_RESET_TOKEN_BYTES,
} from '../common/constants/password-reset.constants';
import type { ResetEmailLang } from '../mail/templates/password-reset.template';

/** New random reset token (base64url, URL-safe). Sent by email only. */
export function newResetToken(): string {
  return randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
}

/** What the database stores instead of the token. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Frontend link to the reset page. `ka` is the default locale and has no
 * prefix (next-intl `localePrefix: "as-needed"`).
 */
export function buildResetLink(
  frontendUrl: string,
  lang: ResetEmailLang,
  token: string,
): string {
  const base = frontendUrl.replace(/\/+$/, '');
  const prefix = lang === 'ka' ? '' : `/${lang}`;
  return `${base}${prefix}${PASSWORD_RESET_PAGE_PATH}?token=${encodeURIComponent(token)}`;
}

/**
 * Public frontend URL for links in emails: `FRONTEND_PUBLIC_URL`, else the
 * first `FRONTEND_ORIGIN` entry. Null when neither is set.
 */
export function resolveFrontendUrl(
  publicUrl: string | undefined,
  origins: string | undefined,
): string | null {
  const explicit = publicUrl?.trim();
  if (explicit) return explicit;
  const first = origins
    ?.split(',')
    .map((o) => o.trim())
    .find(Boolean);
  return first ?? null;
}
