import { buildPasswordResetEmail } from './password-reset.template';

const base = {
  to: 'nino@x.ge',
  name: 'Nino',
  link: 'https://prava.ge/auth/reset-password?token=abc&x=1',
};

describe('buildPasswordResetEmail', () => {
  it('puts the link in both the HTML and the text body', () => {
    const email = buildPasswordResetEmail({
      ...base,
      lang: 'ka',
      variant: 'password',
    });
    expect(email.to).toBe('nino@x.ge');
    expect(email.text).toContain(base.link);
    expect(email.html).toContain(
      'href="https://prava.ge/auth/reset-password?token=abc&amp;x=1"',
    );
  });

  it('escapes the user name in HTML', () => {
    const email = buildPasswordResetEmail({
      ...base,
      name: '<script>x</script>',
      lang: 'en',
      variant: 'password',
    });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
  });

  it('tells Google-only users they sign in with Google', () => {
    const email = buildPasswordResetEmail({
      ...base,
      lang: 'en',
      variant: 'google',
    });
    expect(email.subject).toBe('Set a password — prava.ge');
    expect(email.text).toContain('Sign in with Google');
  });

  it('writes in the requested language', () => {
    const ru = buildPasswordResetEmail({
      ...base,
      lang: 'ru',
      variant: 'password',
    });
    expect(ru.subject).toContain('Восстановление пароля');
    expect(ru.html).toContain('lang="ru"');
  });
});
