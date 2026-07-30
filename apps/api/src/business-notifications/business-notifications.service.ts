import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface BusinessNotificationRow {
  id: string;
  type: string;
  title: string;
  message: string;
  entity: string | null;
  entityId: string | null;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class BusinessNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, requestedLimit?: number) {
    const limit = Math.min(Math.max(Number(requestedLimit) || 50, 1), 100);
    return this.prisma.$queryRaw<BusinessNotificationRow[]>(Prisma.sql`
      SELECT "id", "type", "title", "message", "entity", "entityId", "actionUrl", "readAt", "createdAt"
      FROM "BusinessNotification"
      WHERE "recipientId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `);
  }

  async unread(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "BusinessNotification"
      WHERE "recipientId" = ${userId} AND "readAt" IS NULL
    `);
    return { count: Number(rows[0]?.count ?? 0) };
  }

  async markRead(id: string, userId: string) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "BusinessNotification"
      SET "readAt" = COALESCE("readAt", CURRENT_TIMESTAMP)
      WHERE "id" = ${id}::uuid AND "recipientId" = ${userId}::uuid
    `);
    if (!updated) throw new NotFoundException('Notification introuvable.');
    return { success: true };
  }

  async markAllRead(userId: string) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "BusinessNotification"
      SET "readAt" = CURRENT_TIMESTAMP
      WHERE "recipientId" = ${userId}::uuid AND "readAt" IS NULL
    `);
    return { updated };
  }
}
