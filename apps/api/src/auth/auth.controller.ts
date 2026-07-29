import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../common/authenticated-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './auth.constants';
import { AuthService, TokenPair } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { DisableTwoFactorDto, VerifyTwoFactorDto } from './dto/two-factor.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    this.secureCookies = config.get('NODE_ENV') === 'production';
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto, {
      ipAddress: request.ip,
      userAgent: request.get('user-agent'),
    });
    this.setCookies(response, result.tokens);
    return { user: result.user };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = this.readCookie(request, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException('Session absente.');
    const result = await this.auth.refresh(token);
    this.setCookies(response, result.tokens);
    return { user: result.user };
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(this.readCookie(request, REFRESH_COOKIE));
    response.clearCookie(ACCESS_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }

  @Get('two-factor/status')
  @ApiCookieAuth(ACCESS_COOKIE)
  @UseGuards(JwtAuthGuard)
  twoFactorStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.twoFactorStatus(user.id);
  }

  @Post('two-factor/setup')
  @ApiCookieAuth(ACCESS_COOKIE)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  setupTwoFactor(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.startTwoFactorSetup(user.id);
  }

  @Post('two-factor/enable')
  @ApiCookieAuth(ACCESS_COOKIE)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  enableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyTwoFactorDto,
  ) {
    return this.auth.enableTwoFactor(user.id, dto.code);
  }

  @Post('two-factor/disable')
  @ApiCookieAuth(ACCESS_COOKIE)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  disableTwoFactor(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.auth.disableTwoFactor(user.id, dto.password, dto.code);
  }

  @Get('me')
  @ApiCookieAuth(ACCESS_COOKIE)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findPublicById(user.id);
  }

  private setCookies(response: Response, tokens: TokenPair): void {
    const common = {
      httpOnly: true,
      secure: this.secureCookies,
      sameSite: 'lax' as const,
    };
    response.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...common,
      path: '/',
      maxAge: tokens.accessMaxAgeMs,
    });
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...common,
      path: '/api/auth',
      maxAge: tokens.refreshMaxAgeMs,
    });
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[name];
  }
}
