import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  uploadedAt: true,
} as const;

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async conversations(userId: string) {
    const hiddenIds = await this.deletedMessageIds(userId);
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      },
      orderBy: { sentAt: 'desc' },
      take: 1000,
      include: { attachments: { select: attachmentSelect } },
    });
    const latestByUser = new Map<string, (typeof messages)[number]>();
    for (const message of messages) {
      const otherId = message.senderId === userId ? message.receiverId : message.senderId;
      if (!latestByUser.has(otherId)) latestByUser.set(otherId, message);
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...latestByUser.keys()] } },
      select: { id: true, username: true, role: true, isActive: true },
    });
    const unread = await this.prisma.message.groupBy({
      by: ['senderId'],
      where: {
        receiverId: userId,
        readAt: null,
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      },
      _count: { _all: true },
    });
    const unreadMap = new Map(unread.map((entry) => [entry.senderId, entry._count._all]));

    return users
      .map((user) => ({
        user,
        lastMessage: latestByUser.get(user.id),
        unreadCount: unreadMap.get(user.id) ?? 0,
      }))
      .sort(
        (first, second) =>
          new Date(second.lastMessage?.sentAt ?? 0).getTime() -
          new Date(first.lastMessage?.sentAt ?? 0).getTime(),
      );
  }

  async unread(userId: string) {
    const hiddenIds = await this.deletedMessageIds(userId);
    const where = {
      receiverId: userId,
      readAt: null,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
    };
    const [count, latest] = await Promise.all([
      this.prisma.message.count({ where }),
      this.prisma.message.findFirst({
        where,
        orderBy: { sentAt: 'desc' },
        include: {
          sender: { select: { id: true, username: true, role: true } },
          attachments: { select: attachmentSelect },
        },
      }),
    ]);
    return { count, latest };
  }

  async conversation(userId: string, otherId: string) {
    const other = await this.prisma.user.findUnique({ where: { id: otherId } });
    if (!other) throw new NotFoundException('Destinataire introuvable.');
    const hiddenIds = await this.deletedMessageIds(userId);
    await this.prisma.message.updateMany({
      where: {
        senderId: otherId,
        receiverId: userId,
        readAt: null,
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      },
      data: { readAt: new Date() },
    });
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherId },
          { senderId: otherId, receiverId: userId },
        ],
        ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      },
      orderBy: { sentAt: 'asc' },
      take: 500,
      include: { attachments: { select: attachmentSelect } },
    });
  }

  async send(userId: string, dto: SendMessageDto) {
    if (userId === dto.receiverId) throw new BadRequestException('Vous ne pouvez pas vous écrire.');
    await this.assertReceiver(dto.receiverId);
    return this.prisma.message.create({
      data: { senderId: userId, receiverId: dto.receiverId, content: dto.content.trim() },
      include: { attachments: { select: attachmentSelect } },
    });
  }

  async sendAttachment(
    userId: string,
    dto: SendMessageDto,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (userId === dto.receiverId) throw new BadRequestException('Vous ne pouvez pas vous écrire.');
    await this.assertReceiver(dto.receiverId);
    const acceptedTypes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]);
    if (!acceptedTypes.has(file.mimetype)) {
      throw new BadRequestException('Formats acceptés : PDF, image, TXT, CSV, Word ou Excel.');
    }
    if (!file.size || file.size > 10 * 1024 * 1024) {
      throw new BadRequestException('La pièce jointe ne doit pas dépasser 10 Mo.');
    }
    return this.prisma.message.create({
      data: {
        senderId: userId,
        receiverId: dto.receiverId,
        content: dto.content.trim() || 'Pièce jointe',
        attachments: {
          create: {
            fileName: file.originalname.slice(0, 255),
            mimeType: file.mimetype,
            sizeBytes: file.size,
            data: Uint8Array.from(file.buffer),
          },
        },
      },
      include: { attachments: { select: attachmentSelect } },
    });
  }

  async deleteForUser(id: string, userId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message introuvable.');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "MessageDeletion" ("id", "messageId", "userId")
        VALUES (${randomUUID()}::uuid, ${id}::uuid, ${userId}::uuid)
        ON CONFLICT ("messageId", "userId") DO NOTHING
      `);
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'MESSAGE_HIDDEN_BY_USER',
          entity: 'Message',
          entityId: id,
        },
      });
    });
    return { success: true };
  }

  async attachment(id: string, userId: string) {
    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        id,
        message: { OR: [{ senderId: userId }, { receiverId: userId }] },
      },
    });
    if (!attachment) throw new NotFoundException('Pièce jointe introuvable.');
    const hidden = await this.prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
      SELECT EXISTS(
        SELECT 1 FROM "MessageDeletion"
        WHERE "messageId" = ${attachment.messageId}::uuid AND "userId" = ${userId}::uuid
      ) AS "exists"
    `);
    if (hidden[0]?.exists) throw new NotFoundException('Pièce jointe introuvable.');
    return attachment;
  }

  private async deletedMessageIds(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ messageId: string }>>(Prisma.sql`
      SELECT "messageId"
      FROM "MessageDeletion"
      WHERE "userId" = ${userId}::uuid
    `);
    return rows.map((row) => row.messageId);
  }

  private async assertReceiver(receiverId: string) {
    const receiver = await this.prisma.user.findFirst({
      where: { id: receiverId, isActive: true },
      select: { id: true },
    });
    if (!receiver) throw new NotFoundException('Destinataire introuvable.');
  }
}
