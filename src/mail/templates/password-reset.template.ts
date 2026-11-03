import { PASSWORD_RESET_TTL_MINUTES } from '../../common/constants/password-reset.constants';
import type { OutgoingEmail } from '../mail.service';

export type ResetEmailLang = 'ka' | 'en' | 'ru';

/** `password`: normal reset. `google`: account has no password yet. */
export type ResetEmailVariant = 'password' | 'google';

type Copy = {
  subject: string;
  greeting: (name: string) => string;
  intro: string;
  button: string;
  footer: string;
};

const TTL = PASSWORD_RESET_TTL_MINUTES;

const COPY: Record<ResetEmailLang, Record<ResetEmailVariant, Copy>> = {
  ka: {
    password: {
      subject: 'პაროლის აღდგენა — prava.ge',
      greeting: (name) => `გამარჯობა, ${name}!`,
      intro:
        'მივიღეთ მოთხოვნა შენი prava.ge ანგარიშის პაროლის შეცვლაზე. ახალი პაროლის დასაყენებლად დააჭირე ღილაკს:',
      button: 'ახალი პაროლის დაყენება',
      footer: `ბმული მოქმედებს ${TTL} წუთი და მხოლოდ ერთხელ. პაროლის შეცვლის შემდეგ ყველა მოწყობილობიდან გამოხვალ. თუ ეს შენ არ მოგითხოვია, უგულებელყავი წერილი — პაროლი არ შეიცვლება.`,
    },
    google: {
      subject: 'პაროლის დაყენება — prava.ge',
      greeting: (name) => `გამარჯობა, ${name}!`,
      intro:
        'შენ prava.ge-ზე Google-ით შედიხარ, ამიტომ ამ ანგარიშს პაროლი არ აქვს — შესასვლელად გამოიყენე „Google-ით შესვლა“. თუ გინდა ელფოსტითა და პაროლითაც შესვლა, დააყენე პაროლი:',
      button: 'პაროლის დაყენება',
      footer: `ბმული მოქმედებს ${TTL} წუთი და მხოლოდ ერთხელ. თუ ეს შენ არ მოგითხოვია, უგულებელყავი წერილი.`,
    },
  },
  en: {
    password: {
      subject: 'Reset your password — prava.ge',
      greeting: (name) => `Hi ${name},`,
      intro:
        'We received a request to reset the password of your prava.ge account. Choose a new password here:',
      button: 'Set a new password',
      footer: `The link works for ${TTL} minutes and only once. After the change you will be signed out on every device. If you didn't ask for this, ignore this email — your password stays the same.`,
    },
    google: {
      subject: 'Set a password — prava.ge',
      greeting: (name) => `Hi ${name},`,
      intro:
        'You sign in to prava.ge with Google, so this account has no password — use "Sign in with Google". If you also want to sign in with email and password, set one here:',
      button: 'Set a password',
      footer: `The link works for ${TTL} minutes and only once. If you didn't ask for this, ignore this email.`,
    },
  },
  ru: {
    password: {
      subject: 'Восстановление пароля — prava.ge',
      greeting: (name) => `Здравствуйте, ${name}!`,
      intro:
        'Мы получили запрос на смену пароля вашего аккаунта prava.ge. Задайте новый пароль по кнопке:',
      button: 'Задать новый пароль',
      footer: `Ссылка действует ${TTL} минут и только один раз. После смены пароля вы выйдете на всех устройствах. Если вы не запрашивали смену, просто проигнорируйте письмо — пароль не изменится.`,
    },
    google: {
      subject: 'Установка пароля — prava.ge',
      greeting: (name) => `Здравствуйте, ${name}!`,
      intro:
        'Вы входите на prava.ge через Google, поэтому у аккаунта нет пароля — используйте «Войти через Google». Если хотите входить и по почте с паролем, задайте пароль:',
      button: 'Задать пароль',
      footer: `Ссылка действует ${TTL} минут и только один раз. Если вы этого не запрашивали, проигнорируйте письмо.`,
    },
  },
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Builds the reset email. `link` must already contain the token. */
export function buildPasswordResetEmail(args: {
  to: string;
  name: string;
  link: string;
  lang: ResetEmailLang;
  variant: ResetEmailVariant;
}): OutgoingEmail {
  const copy = COPY[args.lang][args.variant];
  const name = args.name.trim() || 'prava.ge';
  const link = escapeHtml(args.link);

  const html = `<!doctype html>
<html lang="${args.lang}"><body style="margin:0;padding:24px;background:#f4f6fa;font-family:Arial,sans-serif;color:#1b2333">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="font-size:16px;margin:0 0 12px">${escapeHtml(copy.greeting(name))}</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">${escapeHtml(copy.intro)}</p>
<p style="margin:0 0 20px"><a href="${link}" style="display:inline-block;background:#1f5fd6;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(copy.button)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#5b6577;margin:0">${escapeHtml(copy.footer)}</p>
</div></body></html>`;

  const text = [
    copy.greeting(name),
    '',
    copy.intro,
    args.link,
    '',
    copy.footer,
  ].join('\n');

  return { to: args.to, subject: copy.subject, html, text };
}
