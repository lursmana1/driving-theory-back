import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

function cookieExtractor(req: any): string | null {
  // No cookie-parser dependency: parse raw Cookie header.
  const cookieHeader: string | undefined = req?.headers?.cookie;
  if (!cookieHeader) return null;
  console.log(cookieHeader, 'cookieHeader');

  const parts = cookieHeader.split(';').map((p) => p.trim());
  console.log(parts, 'parts');
  const tokenPart = parts.find((p) => p.startsWith('access_token='));
  if (!tokenPart) return null;

  const token = tokenPart.substring('access_token='.length);
  console.log(token, 'token');

  return token || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: 'your-super-secret-key-change-in-production',
    });
  }

  async validate(payload: { sub: number; email: string }) {
    // This becomes req.user
    return { userId: payload.sub, email: payload.email };
  }
}
