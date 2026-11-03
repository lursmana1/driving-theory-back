import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/auth.constants';
import {
  PASSWORD_RESET_MAX_PER_WINDOW,
  PASSWORD_RESET_TTL_MINUTES,
  PASSWORD_RESET_WINDOW_MINUTES,
} from '../common/constants/password-reset.constants';
import { normalizeEmail } from '../common/utils/email.util.js';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import { MailService } from '../mail/mail.service';
import {
  buildPasswordResetEmail,
  type ResetEmailLang,
} from '../mail/templates/password-reset.template';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import {
  buildResetLink,
  hashResetToken,
  newResetToken,
  resolveFrontendUrl,
} from './password-reset.util';

export const INVALID_RESET_LINK = 'Invalid or expired reset link';
export const RESET_EMAIL_UNAVAILABLE = 'Password reset email is unavailable';

/** Marks every open link of a user as used (a newer one replaces them). */
const CLOSE_OPEN_LINKS_SQL = `
UPDATE password_resets SET "usedAt" = now()
WHERE "userId" = $1 AND "usedAt" IS NULL`;

/**
 * Takes a link: only an unused, unexpired one, in one statement so two
 * parallel submits cannot both use it. CTE so the driver returns plain rows.
 */
export const CONSUME_RESET_LINK_SQL = `
WITH used AS (
  UPDATE password_resets SET "usedAt" = now()
  WHERE "tokenHash" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()
  RETURNING "userId"
)
SELECT "userId" FROM used`;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /auth/forgot-password. Returns at once and does the work in the
   * background, so the response time does not reveal whether the address
   * has an account.
   *
   * 503 when email sending is not configured at all. That answer is the same
   * for every address, so it reveals nothing about accounts. Failures that
   * depend on the recipient (Resend rejecting one address) stay silent to the
   * caller and go to the log only.
   */
  requestReset(email: string, lang: ResetEmailLang): void {
    if (!this.frontendUrl() || !this.mail.enabled) {
      this.logger.warn(
        'Password reset unavailable: RESEND_API_KEY / EMAIL_FROM / frontend URL missing',
      );
      throw new ServiceUnavailableException(RESET_EMAIL_UNAVAILABLE);
    }
    void this.sendResetLink(normalizeEmail(email), lang).catch((err) =>
      this.logger.error(
        'Password reset request failed',
        err instanceof Error ? err.stack : String(err),
      ),
    );
  }

  /** Exposed for tests; callers use `requestReset`. */
  async sendResetLink(email: string, lang: ResetEmailLang): Promise<void> {
    const [user] = await this.authService.findByEmail(email);
    if (!user) return;

    const frontendUrl = this.frontendUrl();
    if (!frontendUrl || !this.mail.enabled) {
      this.logger.warn(
        'Password reset skipped: email or frontend URL not configured',
      );
      return;
    }

    const token = newResetToken();
    const created = await this.dataSource.transaction(async (m) => {
      // Serialises parallel requests for one account so the cap holds.
      await m.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const [recent] = await m.query<{ count: string | number }[]>(
        `SELECT count(*) AS count FROM password_resets
         WHERE "userId" = $1
           AND "createdAt" > now() - make_interval(mins => $2::int)`,
        [user.id, PASSWORD_RESET_WINDOW_MINUTES],
      );
      if (parsePgInt(recent?.count) >= PASSWORD_RESET_MAX_PER_WINDOW) {
        return false;
      }
      await m.query(CLOSE_OPEN_LINKS_SQL, [user.id]);
      await m.query(
        `INSERT INTO password_resets ("userId", "tokenHash", "expiresAt")
         VALUES ($1, $2, now() + make_interval(mins => $3::int))`,
        [user.id, hashResetToken(token), PASSWORD_RESET_TTL_MINUTES],
      );
      return true;
    });
    if (!created) return;

    await this.mail.send(
      buildPasswordResetEmail({
        to: user.email,
        name: user.name,
        link: buildResetLink(frontendUrl, lang, token),
        lang,
        variant: user.password ? 'password' : 'google',
      }),
    );
  }

  private frontendUrl(): string | null {
    return resolveFrontendUrl(
      this.config.get<string>('FRONTEND_PUBLIC_URL'),
      this.config.get<string>('FRONTEND_ORIGIN'),
    );
  }

  /**
   * POST /auth/reset-password: sets the new password, closes every other
   * link, bumps `tokenVersion` (all devices signed out) and returns a fresh
   * session for this device.
   */
  async resetPassword(token: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await this.dataSource.transaction(async (m) => {
      const [link] = await m.query<{ userId: string | number }[]>(
        CONSUME_RESET_LINK_SQL,
        [hashResetToken(token)],
      );
      if (!link) return null;
      const userId = parsePgInt(link.userId);
      await m.query(CLOSE_OPEN_LINKS_SQL, [userId]);
      await m.query(
        `UPDATE users
         SET password = $1, "tokenVersion" = "tokenVersion" + 1
         WHERE id = $2`,
        [hashedPassword, userId],
      );
      return m.findOneBy(User, { id: userId });
    });

    if (!user) throw new BadRequestException(INVALID_RESET_LINK);
    return this.authService.generateToken(user);
  }
}
