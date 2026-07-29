import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBackupRunDto,
  CreateOfflineConflictDto,
  ResolveOfflineConflictDto,
} from './dto/clinical-safety.dto';

@Injectable()
export class SecurityContinuityService {
  constructor(private readonly prisma: PrismaService) {}

  async securitySummary() {
    const [events, locks, sessions] = await Promise.all([
      this.prisma.$queryRaw<Array<{ failed24h: number; successful24h: number; distinctFailedUsers: number }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "success" = false AND "occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS "failed24h",
          COUNT(*) FILTER (WHERE "success" = true AND "occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS "successful24h",
          COUNT(DISTINCT "username") FILTER (WHERE "success" = false AND "occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::integer AS "distinctFailedUsers"
        FROM "LoginSecurityEvent"
      `),
      this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT l.*, u."username", u."role"
        FROM "UserSecurityLock" l
        JOIN "User" u ON u."id" = l."userId"
        WHERE l."lockedUntil" IS NOT NULL AND l."lockedUntil" > CURRENT_TIMESTAMP
        ORDER BY l."lockedUntil" DESC
      `),
      this.prisma.$queryRaw<Array<{ active: number; expiringSoon: number }>>(Prisma.sql`
        SELECT
          COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP)::integer AS "active",
          COUNT(*) FILTER (WHERE "revokedAt" IS NULL AND "expiresAt" BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '24 hours')::integer AS "expiringSoon"
        FROM "AuthSession"
      `),
    ]);
    return {
      loginEvents: events[0] ?? { failed24h: 0, successful24h: 0, distinctFailedUsers: 0 },
      lockedUsers: locks,
      sessions: sessions[0] ?? { active: 0, expiringSoon: 0 },
      policy: {
        maximumFailedAttempts: 5,
        lockDurationMinutes: 15,
        recommendedIdleTimeoutMinutes: 15,
        sensitiveRoles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT', 'DOCTOR'],
      },
    };
  }

  loginEvents(limit = 200) {
    const safeLimit = Math.min(Math.max(limit, 1), 1000);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, u."role"
      FROM "LoginSecurityEvent" e
      LEFT JOIN "User" u ON u."id" = e."userId"
      ORDER BY e."occurredAt" DESC
      LIMIT ${safeLimit}
    `);
  }

  activeSessions(userId?: string) {
    const userFilter = userId ? Prisma.sql`AND s."userId" = ${userId}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT s."id", s."userId", s."userAgent", s."ipAddress", s."expiresAt", s."revokedAt", s."createdAt",
             u."username", u."role"
      FROM "AuthSession" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE s."revokedAt" IS NULL AND s."expiresAt" > CURRENT_TIMESTAMP ${userFilter}
      ORDER BY s."createdAt" DESC
      LIMIT 1000
    `);
  }

  async revokeSession(id: string, actorId: string) {
    const count = await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!count.count) throw new NotFoundException('Session active introuvable.');
    await this.audit(actorId, 'SECURITY_SESSION_REVOKED', 'AuthSession', id);
    return { id, revoked: true };
  }

  backups() {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT b.*, u."username" AS "createdBy"
      FROM "BackupRun" b
      LEFT JOIN "User" u ON u."id" = b."createdById"
      ORDER BY b."startedAt" DESC
      LIMIT 500
    `);
  }

  async registerBackup(dto: CreateBackupRunDto, userId: string) {
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "BackupRun" (
        "id", "status", "startedAt", "completedAt", "sizeBytes", "location", "checksum", "restoredTestAt", "notes", "createdById"
      ) VALUES (
        ${id}, ${dto.status}, ${dto.startedAt ? new Date(dto.startedAt) : new Date()},
        ${dto.completedAt ? new Date(dto.completedAt) : null}, ${dto.sizeBytes ?? null}, ${dto.location?.trim() || null},
        ${dto.checksum?.trim() || null}, ${dto.restoredTestAt ? new Date(dto.restoredTestAt) : null},
        ${dto.notes?.trim() || null}, ${userId}
      ) RETURNING *
    `);
    await this.audit(userId, 'BACKUP_RUN_REGISTERED', 'BackupRun', id, { status: dto.status, location: dto.location });
    return rows[0];
  }

  async markBackupRestored(id: string, notes: string | undefined, userId: string) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "BackupRun"
      SET "status" = 'RESTORED_TESTED', "restoredTestAt" = CURRENT_TIMESTAMP,
          "notes" = COALESCE(${notes?.trim() || null}, "notes")
      WHERE "id" = ${id}
    `);
    if (!count) throw new NotFoundException('Sauvegarde introuvable.');
    await this.audit(userId, 'BACKUP_RESTORE_TESTED', 'BackupRun', id);
    return { id, status: 'RESTORED_TESTED' };
  }

  conflicts(status?: string) {
    const statusFilter = status ? Prisma.sql`AND c."status" = ${status}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT c.*, u."username", u."role"
      FROM "OfflineSyncConflict" c
      JOIN "User" u ON u."id" = c."userId"
      WHERE 1 = 1 ${statusFilter}
      ORDER BY c."createdAt" DESC
      LIMIT 1000
    `);
  }

  async createConflict(dto: CreateOfflineConflictDto, userId: string) {
    const id = randomUUID();
    const localPayload = JSON.stringify(dto.localPayload);
    const serverPayload = dto.serverPayload ? JSON.stringify(dto.serverPayload) : null;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "OfflineSyncConflict" (
        "id", "userId", "entityType", "entityId", "localPayload", "serverPayload", "status", "createdAt"
      ) VALUES (
        ${id}, ${userId}, ${dto.entityType.trim()}, ${dto.entityId?.trim() || null}, ${localPayload}::jsonb,
        ${serverPayload}::jsonb, 'OPEN', CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    await this.audit(userId, 'OFFLINE_SYNC_CONFLICT_CREATED', 'OfflineSyncConflict', id, { entityType: dto.entityType });
    return rows[0];
  }

  async resolveConflict(id: string, dto: ResolveOfflineConflictDto, userId: string) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "OfflineSyncConflict"
      SET "status" = ${dto.status}, "resolution" = ${dto.resolution.trim()}, "resolvedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" = 'OPEN'
    `);
    if (!count) throw new NotFoundException('Conflit de synchronisation ouvert introuvable.');
    await this.audit(userId, 'OFFLINE_SYNC_CONFLICT_RESOLVED', 'OfflineSyncConflict', id, { status: dto.status });
    return { id, status: dto.status };
  }

  continuitySummary() {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        (SELECT MAX("completedAt") FROM "BackupRun" WHERE "status" IN ('SUCCESS','RESTORED_TESTED')) AS "lastSuccessfulBackupAt",
        (SELECT MAX("restoredTestAt") FROM "BackupRun" WHERE "restoredTestAt" IS NOT NULL) AS "lastRestoreTestAt",
        (SELECT COUNT(*)::integer FROM "BackupRun" WHERE "status" = 'FAILED' AND "startedAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days') AS "failedBackups30Days",
        (SELECT COUNT(*)::integer FROM "OfflineSyncConflict" WHERE "status" = 'OPEN') AS "openSyncConflicts",
        (SELECT COUNT(*)::integer FROM "AuthSession" WHERE "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP) AS "activeSessions"
    `).then((rows) => rows[0] ?? {});
  }

  private async audit(
    userId: string,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
