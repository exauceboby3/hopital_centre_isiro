import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

export interface BusinessNotificationInput {
  recipientId: string;
  type: string;
  title: string;
  message: string;
  entity?: string;
  entityId?: string;
  actionUrl?: string;
}

export async function createBusinessNotifications(
  transaction: Prisma.TransactionClient,
  entries: BusinessNotificationInput[],
) {
  for (const entry of entries) {
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "BusinessNotification"
        ("id", "recipientId", "type", "title", "message", "entity", "entityId", "actionUrl")
      VALUES
        (${randomUUID()}, ${entry.recipientId}, ${entry.type}, ${entry.title}, ${entry.message},
         ${entry.entity ?? null}, ${entry.entityId ?? null}, ${entry.actionUrl ?? null})
    `);
  }
}
