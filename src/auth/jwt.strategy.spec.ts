import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function setup(rows: { tokenVersion: number | string }[]) {
  const users = { query: jest.fn(() => Promise.resolve(rows)) };
  const config = { get: jest.fn(() => 'secret') };
  const strategy = new JwtStrategy(config as never, users as never);
  return { strategy, users };
}

describe('JwtStrategy.validate', () => {
  it('accepts a token whose version matches the user', async () => {
    const { strategy, users } = setup([{ tokenVersion: '2' }]);
    await expect(
      strategy.validate({ sub: 5, email: 'a@x.ge', ver: 2 }),
    ).resolves.toEqual({ userId: 5, email: 'a@x.ge', type: 'user' });
    expect(users.query).toHaveBeenCalledWith(
      'SELECT "tokenVersion" FROM users WHERE id = $1',
      [5],
    );
  });

  it('treats tokens without ver as version 0', async () => {
    const { strategy } = setup([{ tokenVersion: 0 }]);
    await expect(
      strategy.validate({ sub: 5, email: 'a@x.ge' }),
    ).resolves.toMatchObject({ userId: 5 });
  });

  it('rejects a token signed before a password reset', async () => {
    const { strategy } = setup([{ tokenVersion: 1 }]);
    await expect(
      strategy.validate({ sub: 5, email: 'a@x.ge' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token of a deleted user', async () => {
    const { strategy } = setup([]);
    await expect(
      strategy.validate({ sub: 5, email: 'a@x.ge', ver: 0 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
