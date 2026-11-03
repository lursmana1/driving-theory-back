import {
  buildResetLink,
  hashResetToken,
  newResetToken,
  resolveFrontendUrl,
} from './password-reset.util';

describe('password reset utils', () => {
  it('makes 43-char URL-safe tokens that differ every time', () => {
    const a = newResetToken();
    const b = newResetToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('stores a sha256 hex hash, never the token', () => {
    const token = newResetToken();
    const hash = hashResetToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
    expect(hashResetToken(token)).toBe(hash);
  });

  it('builds unprefixed ka links and prefixed en/ru links', () => {
    expect(buildResetLink('https://prava.ge/', 'ka', 'abc')).toBe(
      'https://prava.ge/auth/reset-password?token=abc',
    );
    expect(buildResetLink('https://prava.ge', 'ru', 'abc')).toBe(
      'https://prava.ge/ru/auth/reset-password?token=abc',
    );
  });

  it('prefers FRONTEND_PUBLIC_URL, then the first FRONTEND_ORIGIN', () => {
    expect(resolveFrontendUrl(' https://prava.ge ', 'http://x')).toBe(
      'https://prava.ge',
    );
    expect(
      resolveFrontendUrl(undefined, ' https://prava.ge , https://www.prava.ge'),
    ).toBe('https://prava.ge');
    expect(resolveFrontendUrl('', '')).toBeNull();
  });
});
