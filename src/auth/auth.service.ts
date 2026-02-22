import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async register(name: string, email: string, password: string) {
    // Check if user already exists
    const existingUser = await this.usersRepository.findOneBy({ email });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = this.usersRepository.create({
      name,
      email,
      password: hashedPassword,
    });

    await this.usersRepository.save(user);

    // Return token
    return this.generateToken(user);
  }

  async validateOrCreateGoogleUser(
    googleId: string,
    email: string | undefined,
    name: string,
  ) {
    if (!email) {
      throw new UnauthorizedException('Google account has no email');
    }
    let user = await this.usersRepository.findOne({
      where: [{ googleId }, { email }],
    });

    if (!user) {
      user = this.usersRepository.create({
        googleId,
        email,
        name,
      });
      await this.usersRepository.save(user);
    } else if (!user.googleId) {
      user.googleId = googleId;
      await this.usersRepository.save(user);
    }

    return this.generateToken(user);
  }

  async login(email: string, password: string) {
    // Find user
    const user = await this.usersRepository.findOneBy({ email });
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Return token
    return this.generateToken(user);
  }

  private generateToken(user: User) {
    const payload = { sub: user.id, email: user.email };
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
