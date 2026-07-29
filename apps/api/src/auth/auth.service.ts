import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AccessTokenPayload, RefreshTokenPayload } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { durationToSeconds } from './auth.constants';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
}

interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

interface SecurityLockRow {
  failedAttempts: number;
  lockedUntil: Date | null;
}

interface TwoFactorRow {
  id: string;
  encryptedSecret: string;
  enabledAt: Date | null;
}

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MINUTES = 15;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlSeconds: number;
  private readonly totpEncryptionKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtlSeconds = durationToSeconds(config.get('JWT_ACCESS_TTL', '15m'), 900);
    this.refreshTtlSeconds = durationToSeconds(config.get('JWT_REFRESH_TTL', '7d'), 604800);
    this.totpEncryptionKey = createHash('sha256')
      .update(config.get('TOTP_ENCRYPTION_KEY', `${this.accessSecret}:hospital-totp`))
      .digest();
  }

  async login(dto: LoginDto, context: ClientContext) {
    const username = dto.username.trim();
    const user = await this.users.findByUsername(username);
    if (user) await this.assertNotLocked(user.id);

    const valid =
      Boolean(user?.isActive) && Boolean(user && (await argon2.verify(user.passwordHash, dto.password)));
    if (!user || !valid) {
      await this.registerFailure(
        username,
        user?.id,
        context,
        user?.isActive === false ? 'Compte inactif' : 'Mot de passe incorrect',
      );
      throw new UnauthorizedException('Identifiant ou mot de passe incorrect.');
    }

    const twoFactor = await this.findTwoFactor(user.id);
    if (
      twoFactor?.enabledAt &&
      (!dto.otpCode || !this.verifyTotp(this.decryptSecret(twoFactor.encryptedSecret), dto.otpCode))
    ) {
      await this.registerFailure(username, user.id, context, 'Code TOTP absent ou incorrect');
      throw new UnauthorizedException('Code de vérification à deux facteurs requis ou incorrect.');
    }

    await Promise.all([
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastActiveAt: new Date() },
      }),
      this.clearFailures(user.id),
      this.recordLoginEvent(username, user.id, true, context, 'Connexion réussie'),
    ]);

    const tokens = await this.createSession(
      { id: user.id, username: user.username, role: user.role },
      context,
    );

    return { user: await this.users.findPublicById(user.id), tokens };
  }

  async twoFactorStatus(userId: string) {
    const row = await this.findTwoFactor(userId);
    return { enabled: Boolean(row?.enabledAt), enabledAt: row?.enabledAt ?? null };
  }

  async startTwoFactorSetup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });
    if (!user) throw new UnauthorizedException('Utilisateur introuvable.');
    const current = await this.findTwoFactor(userId);
    if (current?.enabledAt) {
      throw new BadRequestException('La vérification à deux facteurs est déjà activée.');
    }

    const secret = this.encodeBase32(randomBytes(20));
    const encryptedSecret = this.encryptSecret(secret);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "UserTwoFactor" (
        "id", "userId", "encryptedSecret", "enabledAt", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${encryptedSecret}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId") DO UPDATE SET
        "encryptedSecret" = EXCLUDED."encryptedSecret",
        "enabledAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    `);

    const issuer = "Centre Hospitalier d'Isiro";
    const label = `${issuer}:${user.username}`;
    const otpauthUri =
      `otpauth://totp/${encodeURIComponent(label)}` +
      `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
    return { secret, otpauthUri, accountName: user.username, issuer };
  }

  async enableTwoFactor(userId: string, code: string) {
    const row = await this.findTwoFactor(userId);
    if (!row) throw new BadRequestException("Commencez d'abord la configuration à deux facteurs.");
    if (!this.verifyTotp(this.decryptSecret(row.encryptedSecret), code)) {
      throw new BadRequestException('Le code de vérification est incorrect ou expiré.');
    }
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "UserTwoFactor"
      SET "enabledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "userId" = ${userId}
    `);
    await this.prisma.auditLog.create({
      data: { userId, action: 'TWO_FACTOR_ENABLED', entity: 'User', entityId: userId },
    });
    return { enabled: true };
  }

  async disableTwoFactor(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    }
    const row = await this.findTwoFactor(userId);
    if (!row?.enabledAt) throw new BadRequestException("L'authentification à deux facteurs n'est pas active.");
    if (!this.verifyTotp(this.decryptSecret(row.encryptedSecret), code)) {
      throw new UnauthorizedException('Le code de vérification est incorrect ou expiré.');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        DELETE FROM "UserTwoFactor" WHERE "userId" = ${userId}
      `);
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await transaction.auditLog.create({
        data: { userId, action: 'TWO_FACTOR_DISABLED', entity: 'User', entityId: userId },
      });
    });
    return { enabled: false, sessionsRevoked: true };
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive ||
      !(await argon2.verify(session.refreshTokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Session expirée.');
    }

    const identity = {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
    };
    const tokens = await this.signTokens(identity, session.id);
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await argon2.hash(tokens.refreshToken),
        expiresAt: new Date(Date.now() + tokens.refreshMaxAgeMs),
      },
    });

    return { user: await this.users.findPublicById(session.user.id), tokens };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;

    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      await this.prisma.authSession.updateMany({
        where: { id: payload.sid, userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }

  private async findTwoFactor(userId: string): Promise<TwoFactorRow | null> {
    const rows = await this.prisma.$queryRaw<TwoFactorRow[]>(Prisma.sql`
      SELECT "id", "encryptedSecret", "enabledAt"
      FROM "UserTwoFactor"
      WHERE "userId" = ${userId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  private encryptSecret(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.totpEncryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decryptSecret(payload: string): string {
    const [ivValue, tagValue, encryptedValue] = payload.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new UnauthorizedException('Configuration à deux facteurs invalide.');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.totpEncryptionKey,
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new UnauthorizedException('Configuration à deux facteurs invalide.');
    }
  }

  private verifyTotp(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    for (const windowOffset of [-1, 0, 1]) {
      const expected = this.totpCode(secret, windowOffset);
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return true;
    }
    return false;
  }

  private totpCode(secret: string, windowOffset: number): string {
    const counter = BigInt(
      Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS) + windowOffset,
    );
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(counter);
    const digest = createHmac('sha1', this.decodeBase32(secret)).update(counterBuffer).digest();
    const offset = digest.readUInt8(digest.length - 1) & 0x0f;
    const binary = digest.readUInt32BE(offset) & 0x7fffffff;
    return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
  }

  private encodeBase32(value: Buffer): string {
    let bits = '';
    for (const byte of value) bits += byte.toString(2).padStart(8, '0');
    let result = '';
    for (let index = 0; index < bits.length; index += 5) {
      const chunk = bits.slice(index, index + 5).padEnd(5, '0');
      result += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
    }
    return result;
  }

  private decodeBase32(value: string): Buffer {
    let bits = '';
    for (const character of value.replace(/=+$/g, '').toUpperCase()) {
      const index = BASE32_ALPHABET.indexOf(character);
      if (index < 0) throw new BadRequestException('Secret à deux facteurs invalide.');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }

  private async assertNotLocked(userId: string) {
    const rows = await this.prisma.$queryRaw<SecurityLockRow[]>(Prisma.sql`
      SELECT "failedAttempts", "lockedUntil" FROM "UserSecurityLock" WHERE "userId" = ${userId} LIMIT 1
    `);
    const lock = rows[0];
    if (lock?.lockedUntil && lock.lockedUntil > new Date()) {
      const minutes = Math.max(1, Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 60_000));
      throw new UnauthorizedException(`Compte temporairement verrouillé. Réessayez dans ${minutes} minute(s).`);
    }
    if (lock?.lockedUntil && lock.lockedUntil <= new Date()) {
      await this.clearFailures(userId);
    }
  }

  private async registerFailure(
    username: string,
    userId: string | undefined,
    context: ClientContext,
    reason: string,
  ) {
    if (userId) {
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "UserSecurityLock" (
          "id", "userId", "failedAttempts", "lockedUntil", "lastFailureAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${userId}, 1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("userId") DO UPDATE SET
          "failedAttempts" = CASE
            WHEN "UserSecurityLock"."lockedUntil" IS NOT NULL AND "UserSecurityLock"."lockedUntil" <= CURRENT_TIMESTAMP THEN 1
            ELSE "UserSecurityLock"."failedAttempts" + 1
          END,
          "lockedUntil" = CASE
            WHEN (
              CASE
                WHEN "UserSecurityLock"."lockedUntil" IS NOT NULL AND "UserSecurityLock"."lockedUntil" <= CURRENT_TIMESTAMP THEN 1
                ELSE "UserSecurityLock"."failedAttempts" + 1
              END
            ) >= ${MAX_LOGIN_FAILURES}
            THEN CURRENT_TIMESTAMP + (${LOGIN_LOCK_MINUTES} * INTERVAL '1 minute')
            ELSE NULL
          END,
          "lastFailureAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      `);
    }
    await this.recordLoginEvent(username, userId, false, context, reason);
  }

  private clearFailures(userId: string) {
    return this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "UserSecurityLock" (
        "id", "userId", "failedAttempts", "lockedUntil", "lastFailureAt", "updatedAt"
      ) VALUES (${randomUUID()}, ${userId}, 0, NULL, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT ("userId") DO UPDATE SET
        "failedAttempts" = 0,
        "lockedUntil" = NULL,
        "lastFailureAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  }

  private recordLoginEvent(
    username: string,
    userId: string | undefined,
    success: boolean,
    context: ClientContext,
    reason: string,
  ) {
    return this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "LoginSecurityEvent" (
        "id", "username", "userId", "success", "ipAddress", "userAgent", "reason", "occurredAt"
      ) VALUES (
        ${randomUUID()}, ${username}, ${userId ?? null}, ${success}, ${context.ipAddress ?? null},
        ${context.userAgent ?? null}, ${reason}, CURRENT_TIMESTAMP
      )
    `);
  }

  private async createSession(
    user: { id: string; username: string; role: Role },
    context: ClientContext,
  ): Promise<TokenPair> {
    const sessionId = randomUUID();
    const tokens = await this.signTokens(user, sessionId);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: await argon2.hash(tokens.refreshToken),
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        expiresAt: new Date(Date.now() + tokens.refreshMaxAgeMs),
      },
    });
    return tokens;
  }

  private async signTokens(
    user: { id: string; username: string; role: Role },
    sessionId: string,
  ): Promise<TokenPair> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = { ...accessPayload, sid: sessionId };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.accessSecret,
        expiresIn: this.accessTtlSeconds,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.refreshSecret,
        expiresIn: this.refreshTtlSeconds,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      accessMaxAgeMs: this.accessTtlSeconds * 1000,
      refreshMaxAgeMs: this.refreshTtlSeconds * 1000,
    };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Session expirée.');
    }
  }
}
