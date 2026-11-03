/** How long a reset link works. */
export const PASSWORD_RESET_TTL_MINUTES = 30;

/** Random bytes in a reset token (base64url → 43 characters). */
export const PASSWORD_RESET_TOKEN_BYTES = 32;
export const PASSWORD_RESET_TOKEN_LENGTH = 43;

/**
 * Most reset emails per account in `PASSWORD_RESET_WINDOW_MINUTES`. Further
 * requests still answer 200 but send nothing (no inbox flooding).
 */
export const PASSWORD_RESET_MAX_PER_WINDOW = 3;
export const PASSWORD_RESET_WINDOW_MINUTES = 60;

/** Same bounds as sign-up; bcrypt ignores bytes after 72. */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;

/** Frontend path of the "choose a new password" page. */
export const PASSWORD_RESET_PAGE_PATH = '/auth/reset-password';
