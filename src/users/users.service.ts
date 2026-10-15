import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/auth.constants';
import { emailEqualsSql, normalizeEmail } from '../common/utils/email.util.js';
import { isUniqueViolation } from '../common/utils/pg-error.util.js';

/** User as exposed over HTTP — never includes `password` or `googleId`. */
export type PublicUser = Omit<User, 'password' | 'googleId'>;

function toPublicUser(user: User): PublicUser {
  const { password: _password, googleId: _googleId, ...rest } = user;
  return rest;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<PublicUser> {
    const { confirmPassword: _confirmPassword, ...data } = createUserDto;
    const email = normalizeEmail(data.email);
    await this.assertEmailFree(email);

    const user = this.usersRepository.create({
      ...data,
      email,
      password: await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS),
    });
    return toPublicUser(await this.saveUser(user));
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.usersRepository.find();
    return users.map(toPublicUser);
  }

  async findOne(id: number): Promise<PublicUser> {
    return toPublicUser(await this.findEntity(id));
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<PublicUser> {
    const { confirmPassword: _confirmPassword, ...data } = updateUserDto;
    const user = await this.findEntity(id);
    if (data.email == null) {
      delete data.email;
    } else if (normalizeEmail(data.email) === normalizeEmail(user.email)) {
      // Unchanged address: keep the stored form, and don't trip over a
      // legacy case-variant twin that already exists.
      delete data.email;
    } else {
      data.email = normalizeEmail(data.email);
      await this.assertEmailFree(data.email, id);
    }
    Object.assign(user, data);
    if (data.password) {
      user.password = await bcrypt.hash(data.password, BCRYPT_SALT_ROUNDS);
    }
    return toPublicUser(await this.saveUser(user));
  }

  async remove(id: number): Promise<void> {
    const user = await this.findEntity(id);
    await this.usersRepository.remove(user);
  }

  /** Case-insensitive, so `A@x.ge` cannot be created next to `a@x.ge`. */
  private async assertEmailFree(
    normalizedEmail: string,
    exceptUserId?: number,
  ): Promise<void> {
    const qb = this.usersRepository
      .createQueryBuilder('u')
      .where(emailEqualsSql('u'), { email: normalizedEmail });
    if (exceptUserId != null) {
      qb.andWhere('u.id <> :exceptUserId', { exceptUserId });
    }
    if ((await qb.getCount()) > 0) {
      throw new ConflictException('Email already exists');
    }
  }

  /** The check above can lose a race; the unique column is the backstop. */
  private async saveUser(user: User): Promise<User> {
    try {
      return await this.usersRepository.save(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Email already exists');
      }
      throw err;
    }
  }

  private async findEntity(id: number): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }
}
