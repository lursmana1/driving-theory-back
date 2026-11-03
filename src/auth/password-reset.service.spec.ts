import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  CONSUME_RESET_LINK_SQL,
  PasswordResetService,
} from './password-reset.service';
import { hashResetToken } from './password-reset.util';
import type { User } from '../users/entities/user.entity';

type QueryFn = (sql: string, params?: unknown[]) => unknown;

function setup(opts: {
  users?: Partial<User>[];
  recentCount?: number;
  consumed?: boolean;
  mailEnabled?: boolean;
  env?: Record<string, string>;
}) {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query: QueryFn = (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('count(*)'))
      return [{ count: String(opts.recentCount ?? 0) }];
    if (sql === CONSUME_RESET_LINK_SQL)
      return opts.consumed ? [{ userId: '7' }] : [];
    return [];
  };
  const manager = {
    query: jest.fn((sql: string, params?: unknown[]) =>
      Promise.resolve(query(sql, params)),
    ),
    findOneBy: jest.fn(() =>
      Promise.resolve({ id: 7, email: 'a@x.ge', name: 'A', tokenVersion: 1 }),
    ),
  };
  const dataSource = {
    transaction: jest.fn((fn: (m: typeof manager) => unknown) => fn(manager)),
  };
  const authService = {
    findByEmail: jest.fn(() => Promise.resolve(opts.users ?? [])),
    generateToken: jest.fn((user: User) => ({
      access_token: 'jwt',
      user: { id: user.id, name: user.name, email: user.email },
    })),
  };
  const mail = {
    enabled: opts.mailEnabled ?? true,
    send: jest.fn(() => Promise.resolve(true)),
  };
  const env: Record<string, string> = {
    FRONTEND_ORIGIN: 'https://prava.ge',
    ...opts.env,
  };
  const config = { get: jest.fn((key: string) => env[key]) };
  const service = new PasswordResetService(
    dataSource as never,
    authService as never,
    mail as never,
    config as never,
  );
  return { service, calls, mail, authService, manager };
}

const user = { id: 7, email: 'a@x.ge', name: 'Ana', password: 'hash' };

describe('PasswordResetService.sendResetLink', () => {
  it('sends nothing for an unknown address', async () => {
    const { service, mail, calls } = setup({ users: [] });
    await service.sendResetLink('nobody@x.ge', 'ka');
    expect(mail.send).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('stores only the hash, closes older links and emails the link', async () => {
    const { service, mail, calls } = setup({ users: [user] });
    await service.sendResetLink('a@x.ge', 'en');

    const insert = calls.find((c) =>
      c.sql.includes('INSERT INTO password_resets'),
    );
    const hash = insert?.params?.[1] as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.some((c) => c.sql.includes('SET "usedAt" = now()'))).toBe(
      true,
    );

    const email = (mail.send.mock.calls[0] as unknown[])[0] as { text: string };
    const token = /token=([A-Za-z0-9_-]{43})/.exec(email.text)?.[1] ?? '';
    expect(email.text).toContain(
      'https://prava.ge/en/auth/reset-password?token=',
    );
    expect(hashResetToken(token)).toBe(hash);
    expect(email.text).not.toContain(hash);
  });

  it('sends the Google variant to an account without a password', async () => {
    const { service, mail } = setup({
      users: [{ ...user, password: undefined }],
    });
    await service.sendResetLink('a@x.ge', 'en');
    const email = (mail.send.mock.calls[0] as unknown[])[0] as {
      subject: string;
    };
    expect(email.subject).toBe('Set a password — prava.ge');
  });

  it('stops after the per-account cap', async () => {
    const { service, mail, calls } = setup({ users: [user], recentCount: 3 });
    await service.sendResetLink('a@x.ge', 'ka');
    expect(mail.send).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });

  it('does nothing when email is not configured', async () => {
    const { service, mail, calls } = setup({
      users: [user],
      mailEnabled: false,
    });
    await service.sendResetLink('a@x.ge', 'ka');
    expect(mail.send).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });
});

describe('PasswordResetService.resetPassword', () => {
  const token = 'A'.repeat(43);

  it('rejects an unknown, used or expired link', async () => {
    const { service, calls } = setup({ consumed: false });
    await expect(
      service.resetPassword(token, 'newpass'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(calls.some((c) => c.sql.includes('UPDATE users'))).toBe(false);
  });

  it('consumes the link by hash, sets the password and bumps tokenVersion', async () => {
    const { service, calls, authService } = setup({ consumed: true });
    const result = await service.resetPassword(token, 'newpass');

    const consume = calls.find((c) => c.sql === CONSUME_RESET_LINK_SQL);
    expect(consume?.params).toEqual([hashResetToken(token)]);

    const update = calls.find((c) => c.sql.includes('UPDATE users'));
    expect(update?.sql).toContain('"tokenVersion" = "tokenVersion" + 1');
    expect(await bcrypt.compare('newpass', update?.params?.[0] as string)).toBe(
      true,
    );
    expect(update?.params?.[1]).toBe(7);

    expect(authService.generateToken).toHaveBeenCalled();
    expect(result.user.id).toBe(7);
  });

  it('only consumes a link that is unused and unexpired', () => {
    const sql = CONSUME_RESET_LINK_SQL.replace(/\s+/g, ' ');
    expect(sql).toContain('"usedAt" IS NULL AND "expiresAt" > now()');
    expect(sql).toContain('WHERE "tokenHash" = $1');
  });
});

describe('PasswordResetService.requestReset', () => {
  it('answers 503 for every address when email is not configured', () => {
    const { service, authService } = setup({ mailEnabled: false });
    expect(() => service.requestReset('a@x.ge', 'ka')).toThrow(
      ServiceUnavailableException,
    );
    expect(authService.findByEmail).not.toHaveBeenCalled();
  });

  it('returns at once when email is configured', () => {
    const { service } = setup({ users: [] });
    expect(service.requestReset('nobody@x.ge', 'ka')).toBeUndefined();
  });
});
