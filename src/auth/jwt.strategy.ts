import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { parsePgInt } from '../common/utils/pg-row.util.js';
import { User } from '../users/entities/user.entity';

export type JwtPayload = {
  sub: number;
  email: string;
  type?: 'admin' | 'user';
  /** `users.tokenVersion` at signing time; absent on older tokens. */
  ver?: number;
};

function cookieExtractor(req?: {
  headers?: { cookie?: string };
}): string | null {
  // No cookie-parser dependency: parse raw Cookie header.
  const cookieHeader: string | undefined = req?.headers?.cookie;
  if (!cookieHeader) return null;

  const parts = cookieHeader.split(';').map((p) => p.trim());
  const tokenPart = parts.find((p) => p.startsWith('access_token='));
  if (!tokenPart) return null;

  const token = tokenPart.substring('access_token='.length);
  return token || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not defined in configuration');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  /**
   * Rejects a token signed before the user's last password reset
   * (`tokenVersion`), or whose user no longer exists. Tokens from before this
   * check have no `ver` and count as version 0. One primary-key read per
   * authenticated request.
   */
  async validate(payload: JwtPayload) {
    const [row] = await this.users.query<{ tokenVersion: number | string }[]>(
      'SELECT "tokenVersion" FROM users WHERE id = $1',
      [payload.sub],
    );
    if (!row || parsePgInt(row.tokenVersion) !== (payload.ver ?? 0)) {
      throw new UnauthorizedException();
    }

    // This becomes req.user
    return {
      userId: payload.sub,
      email: payload.email,
      type: payload.type ?? 'user',
    };
  }
}
