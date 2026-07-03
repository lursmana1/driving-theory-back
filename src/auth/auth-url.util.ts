/**
 * Resolves public API base URL and Google OAuth callback URL from env.
 * Use API_PUBLIC_URL on Render/production so callback matches Google Console.
 */

/** Strip whitespace/newlines accidentally pasted into Render env vars. */
function normalizeEnvUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s/g, '').replace(/\/$/, '');
}

export function resolveApiPublicUrl(): string {
  const explicit = normalizeEnvUrl(process.env.API_PUBLIC_URL);
  if (explicit) {
    return explicit;
  }

  const fromCallback = normalizeEnvUrl(process.env.GOOGLE_CALLBACK_URL);
  if (fromCallback) {
    return fromCallback.replace(/\/auth\/google\/callback\/?$/i, '');
  }

  return 'http://localhost:3000';
}

export function resolveGoogleCallbackUrl(): string {
  const explicit = normalizeEnvUrl(process.env.GOOGLE_CALLBACK_URL);
  if (explicit) {
    return explicit;
  }

  return `${resolveApiPublicUrl()}/auth/google/callback`;
}

export function resolveGoogleLoginUrl(): string {
  return `${resolveApiPublicUrl()}/auth/google`;
}

export function assertGoogleOAuthConfig(): string[] {
  const warnings: string[] = [];
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl = resolveGoogleCallbackUrl();

  if (!clientId || !clientSecret) {
    warnings.push(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set — Google login will not work.',
    );
    return warnings;
  }

  const isLocalhost =
    callbackUrl.includes('localhost') || callbackUrl.includes('127.0.0.1');
  if (callbackUrl.startsWith('http://') && !isLocalhost) {
    warnings.push(
      `Google OAuth callback should use HTTPS in production (got ${callbackUrl}).`,
    );
  }

  return warnings;
}
