import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload, AuthenticatedUser } from '../common/authenticated-user';
import { UsersService } from '../users/users.service';
import { ACCESS_COOKIE } from './auth.constants';

function cookieExtractor(request: Request): string | null {
  const cookies = request.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const user = await this.users.findPublicById(payload.sub);
    if (!user.isActive) {
      throw new UnauthorizedException('Compte désactivé.');
    }
    if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > 60_000) {
      void this.users.touchActive(user.id).catch(() => undefined);
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      additionalRoles: user.additionalRoles,
    };
  }
}
