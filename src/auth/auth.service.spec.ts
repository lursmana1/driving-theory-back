import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { TOUCH_LOGIN_STREAK_SQL } from './login-streak.query';
import type { User } from '../users/entities/user.entity';

function setup(matches: Partial<User>[] = []) {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.getMany = jest.fn().mockResolvedValue(matches);
  const repo = {
    createQueryBuilder: jest.fn(() => qb),
    findOneBy: jest.fn().mockResolvedValue(null),
    create: jest.fn((row: object) => ({ id: 99, ...row })),
    save: jest.fn((row: object) => Promise.resolve(row)),
  };
  const jwt = { sign: jest.fn(() => 'token') };
  const service = new AuthService(repo as never, jwt as never);
  return { service, repo, qb, jwt };
}

describe('AuthService email handling', () => {
  it('looks users up case-insensitively with a normalised address', async () => {
    const { service, qb } = setup();

    await expect(
      service.login('  Nino@Example.GE ', 'pw'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(qb.where).toHaveBeenCalledWith('LOWER(u.email) = :email', {
      email: 'nino@example.ge',
    });
  });

  it('logs into a legacy mixed-case account', async () => {
    const password = await bcrypt.hash('secret1', 4);
    const { service, jwt } = setup([
      { id: 3, email: 'Nino@Example.ge', name: 'Nino', password },
    ]);

    const result = await service.login('nino@example.ge', 'secret1');

    expect(result.user.id).toBe(3);
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 3 }));
  });

  it('picks the account whose password matches when two differ only by case', async () => {
    const { service } = setup([
      {
        id: 1,
        email: 'a@x.ge',
        name: 'A',
        password: await bcrypt.hash('one', 4),
      },
      {
        id: 2,
        email: 'A@x.ge',
        name: 'B',
        password: await bcrypt.hash('two', 4),
      },
    ]);

    expect((await service.login('a@x.ge', 'two')).user.id).toBe(2);
    await expect(service.login('a@x.ge', 'nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects password login for a Google-only account', async () => {
    const { service } = setup([{ id: 1, email: 'a@x.ge', name: 'A' }]);

    await expect(service.login('a@x.ge', 'anything')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('stores new registrations lower-cased', async () => {
    const { service, repo } = setup();

    await service.register({
      name: 'N',
      email: 'New@X.ge',
      password: 'secret1',
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@x.ge' }),
    );
  });

  it('refuses to register an address that exists in another case', async () => {
    const { service, repo } = setup([{ id: 1, email: 'NEW@x.ge' }]);

    await expect(
      service.register({ name: 'N', email: 'new@x.ge', password: 'secret1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('maps a lost registration race to 409, not 500', async () => {
    const { service, repo } = setup();
    repo.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505' }),
      ),
    );

    await expect(
      service.register({ name: 'N', email: 'new@x.ge', password: 'secret1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prefers the exact-case account over an older case-variant twin', async () => {
    const { service, repo } = setup([
      { id: 5, email: 'Victim@gmail.com', name: 'Old twin' },
      { id: 9, email: 'victim@gmail.com', name: 'Owner' },
    ]);

    const result = await service.validateOrCreateGoogleUser(
      'g-9',
      'victim@gmail.com',
      'Owner',
    );

    expect(result.user.id).toBe(9);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, googleId: 'g-9' }),
    );
  });

  it('links Google sign-in to an existing account regardless of email case', async () => {
    const existing = { id: 5, email: 'Nino@Example.ge', name: 'Nino' };
    const { service, repo } = setup([existing]);

    const result = await service.validateOrCreateGoogleUser(
      'g-1',
      'nino@example.ge',
      'Nino',
    );

    expect(result.user.id).toBe(5);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, googleId: 'g-1' }),
    );
  });
});

describe('AuthService.getMe', () => {
  it('counts the visit and returns the streak', async () => {
    const { service, repo } = setup();
    const query = jest.fn().mockResolvedValue([
      {
        id: 5,
        name: 'Nino',
        surname: null,
        email: 'nino@example.ge',
        type: 'user',
        currentStreak: 4,
        longestStreak: 9,
      },
    ]);
    Object.assign(repo, { query });

    const me = await service.getMe(5);

    expect(query).toHaveBeenCalledWith(TOUCH_LOGIN_STREAK_SQL, [5]);
    expect(me).toEqual({
      id: 5,
      name: 'Nino',
      surname: null,
      email: 'nino@example.ge',
      type: 'user',
      streak: { current: 4, longest: 9 },
    });
  });

  it('returns 404 for a deleted user', async () => {
    const { service, repo } = setup();
    Object.assign(repo, { query: jest.fn().mockResolvedValue([]) });

    await expect(service.getMe(5)).rejects.toBeInstanceOf(NotFoundException);
  });
});
