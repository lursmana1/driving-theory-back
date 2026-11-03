import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/auth.constants';
import { emailEqualsSql, normalizeEmail } from '../common/utils/email.util.js';
import {
  isUndefinedTable,
  isUniqueViolation,
} from '../common/utils/pg-error.util.js';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import { TOUCH_LOGIN_STREAK_SQL, type MeRow } from './login-streak.query';
import {
  TRAINER_DUE_SQL,
  type TrainerDueRow,
} from '../mistake-trainer/trainer-due.query.js';

const EMAIL_TAKEN = 'Email already exists';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(data: {
    name: string;
    email: string;
    password: string;
    surname?: string;
  }) {
    const { name, password, surname } = data;
    const email = normalizeEmail(data.email);

    const [existingUser] = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = this.usersRepository.create({
      name,
      email,
      password: hashedPassword,
      type: 'user',
    });
    if (surname) user.surname = surname;

    try {
      await this.usersRepository.save(user);
    } catch (err) {
      // Two registrations for the same address raced past the check above.
      if (isUniqueViolation(err)) throw new ConflictException(EMAIL_TAKEN);
      throw err;
    }

    // Return token
    return this.generateToken(user);
  }

  async validateOrCreateGoogleUser(
    googleId: string,
    rawEmail: string | undefined,
    name: string,
  ) {
    if (!rawEmail) {
      throw new UnauthorizedException('Google account has no email');
    }
    const email = normalizeEmail(rawEmail);
    let user =
      (await this.usersRepository.findOneBy({ googleId })) ??
      (await this.findByEmail(email))[0] ??
      null;

    if (!user) {
      user = this.usersRepository.create({
        googleId,
        email,
        name,
        type: 'user',
      });
      await this.usersRepository.save(user);
    } else if (!user.googleId) {
      user.googleId = googleId;
      await this.usersRepository.save(user);
    }

    return this.generateToken(user);
  }

  async getMe(userId: number) {
    const [[user], due] = await Promise.all([
      this.usersRepository.query<MeRow[]>(TOUCH_LOGIN_STREAK_SQL, [userId]),
      this.loadTrainerDue(userId),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      type: user.type,
      streak: {
        current: user.currentStreak,
        longest: user.longestStreak,
      },
      // Header badge: mistakes due for review now, per category with
      // active mistakes, most due first; [] when there are none.
      trainer: due.map((row) => ({
        categoryId: parsePgInt(row.categoryId),
        dueNow: parsePgInt(row.dueNow),
      })),
    };
  }

  /**
   * The badge must not take GET /auth/me down: until
   * `db:ensure-question-progress` has run, the table is missing and the
   * badge is empty instead of a 500. Other errors still fail the request.
   */
  private async loadTrainerDue(userId: number): Promise<TrainerDueRow[]> {
    try {
      return await this.usersRepository.query<TrainerDueRow[]>(
        TRAINER_DUE_SQL,
        [userId],
      );
    } catch (err) {
      if (isUndefinedTable(err)) return [];
      throw err;
    }
  }

  async login(email: string, password: string) {
    // Accounts created before emails were normalised may differ only by
    // case; the password decides which one is being logged into.
    const candidates = await this.findByEmail(normalizeEmail(email));
    for (const user of candidates) {
      if (user.password && (await bcrypt.compare(password, user.password))) {
        return this.generateToken(user);
      }
    }
    throw new UnauthorizedException('Invalid credentials');
  }

  /**
   * Case-insensitive match. A row stored exactly as the normalised address
   * comes first, so a legacy case-variant twin (`Name@x.ge` next to
   * `name@x.ge`) can never capture a sign-in meant for the exact one.
   */
  async findByEmail(normalizedEmail: string): Promise<User[]> {
    const users = await this.usersRepository
      .createQueryBuilder('u')
      .where(emailEqualsSql('u'), { email: normalizedEmail })
      .orderBy('u.id', 'ASC')
      .getMany();
    const exactFirst = (user: User) => (user.email === normalizedEmail ? 0 : 1);
    return [...users].sort((a, b) => exactFirst(a) - exactFirst(b));
  }

  /**
   * Session token for `user`. `ver` is the user's `tokenVersion`; a password
   * reset bumps it, which invalidates every token signed before.
   */
  generateToken(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      type: user.type ?? 'user',
      ver: user.tokenVersion ?? 0,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }
}
