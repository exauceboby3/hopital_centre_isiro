import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushNotificationDto } from './dto/push-subscription.dto';

interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface PendingMessageRow {
  id: string;
  receiverId: string;
}

interface PendingAlertRow {
  id: string;
  targetRole: Role | null;
  severity: string;
}

export interface HospitalPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

export interface DeliverySummary {
  attempted: number;
  delivered: number;
  failed: number;
  removed: number;
}

const EMPTY_DELIVERY: DeliverySummary = { attempted: 0, delivered: 0, failed: 0, removed: 0 };
const PUSH_RECORD_SIZE = 4096;

function base64Url(value: Buffer): string {
  return value.toString('base64url');
}

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function toArrayBuffer(value: Buffer): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

function hmac(key: Buffer, value: Buffer): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function expand(secret: Buffer, info: Buffer, length: number): Buffer {
  return hmac(secret, Buffer.concat([info, Buffer.from([1])])).subarray(0, length);
}

function validPrivateKey(seed: Buffer): Buffer {
  let candidate = seed;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ecdh = createECDH('prime256v1');
    try {
      ecdh.setPrivateKey(candidate);
      return candidate;
    } catch {
      candidate = createHash('sha256').update(candidate).update(String(attempt)).digest();
    }
  }
  throw new Error('Impossible de produire une clé VAPID valide.');
}

@Injectable()
export class PushNotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushNotificationsService.name);
  private readonly privateKey: Buffer;
  private readonly publicKey: Buffer;
  private readonly subject: string;
  private timer?: NodeJS.Timeout;
  private pumping = false;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const configuredPrivateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const fallbackSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const seed = configuredPrivateKey
      ? decodeBase64Url(configuredPrivateKey)
      : createHash('sha256').update(`${fallbackSecret}:hospital-web-push`).digest();
    if (seed.length !== 32) {
      throw new Error('VAPID_PRIVATE_KEY doit contenir exactement 32 octets en Base64URL.');
    }
    this.privateKey = validPrivateKey(seed);
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(this.privateKey);
    this.publicKey = ecdh.getPublicKey(undefined, 'uncompressed');
    this.subject =
      config.get<string>('VAPID_SUBJECT')?.trim() ||
      'mailto:administration@hopitalcentreisiro.online';
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.deliverPendingNotifications(), 10_000);
    this.timer.unref();
    void this.deliverPendingNotifications();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  publicConfiguration() {
    return {
      enabled: true,
      publicKey: base64Url(this.publicKey),
      privacy:
        "Les notifications de l’écran verrouillé restent génériques et n’affichent aucune donnée médicale.",
    };
  }

  async subscriptionStatus(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "PushSubscription"
      WHERE "userId" = ${userId}
    `);
    return { subscribed: Number(rows[0]?.count ?? 0n) > 0, devices: Number(rows[0]?.count ?? 0n) };
  }

  async subscribe(userId: string, dto: SubscribePushNotificationDto, userAgent?: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PushSubscription" (
        "id", "userId", "endpoint", "p256dh", "auth", "userAgent", "createdAt", "updatedAt"
      ) VALUES (
        ${randomUUID()}, ${userId}, ${dto.endpoint}, ${dto.keys.p256dh}, ${dto.keys.auth},
        ${userAgent?.slice(0, 1000) ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("endpoint") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "p256dh" = EXCLUDED."p256dh",
        "auth" = EXCLUDED."auth",
        "userAgent" = EXCLUDED."userAgent",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "PushSubscription"
      WHERE "userId" = ${userId} AND "endpoint" = ${endpoint}
    `);
    return { subscribed: false };
  }

  async sendTest(userId: string) {
    const result = await this.sendToUser(userId, {
      title: 'Notifications activées',
      body: "Les alertes du Centre Hospitalier d’Isiro peuvent maintenant apparaître sur ce téléphone.",
      url: '/dashboard',
      tag: 'push-test',
      urgency: 'normal',
    });
    if (!result.delivered) {
      throw new ServiceUnavailableException(
        "Aucun appareil n’a accepté la notification. Vérifiez l’autorisation du navigateur.",
      );
    }
    return result;
  }

  async sendToUser(userId: string, payload: HospitalPushPayload): Promise<DeliverySummary> {
    const rows = await this.subscriptionsForUsers([userId]);
    return this.deliver(rows, payload);
  }

  async sendToRoles(roles: Role[], payload: HospitalPushPayload): Promise<DeliverySummary> {
    if (!roles.length) return EMPTY_DELIVERY;
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { in: roles } },
      select: { id: true },
    });
    return this.deliver(await this.subscriptionsForUsers(users.map((user) => user.id)), payload);
  }

  async broadcast(payload: HospitalPushPayload): Promise<DeliverySummary> {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return this.deliver(await this.subscriptionsForUsers(users.map((user) => user.id)), payload);
  }

  private async subscriptionsForUsers(userIds: string[]): Promise<StoredPushSubscription[]> {
    if (!userIds.length) return [];
    return this.prisma.$queryRaw<StoredPushSubscription[]>(Prisma.sql`
      SELECT "endpoint", "p256dh", "auth"
      FROM "PushSubscription"
      WHERE "userId" IN (${Prisma.join(userIds)})
    `);
  }

  private async deliver(
    subscriptions: StoredPushSubscription[],
    payload: HospitalPushPayload,
  ): Promise<DeliverySummary> {
    if (!subscriptions.length) return EMPTY_DELIVERY;
    const safePayload: HospitalPushPayload = {
      title: payload.title.trim().slice(0, 100),
      body: payload.body.trim().slice(0, 240),
      url: payload.url?.startsWith('/') ? payload.url : '/dashboard',
      tag: payload.tag?.slice(0, 80),
      urgency: payload.urgency ?? 'normal',
    };
    const summary: DeliverySummary = {
      attempted: subscriptions.length,
      delivered: 0,
      failed: 0,
      removed: 0,
    };

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          const body = this.encryptPayload(subscription, safePayload);
          const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: {
              Authorization: this.vapidAuthorization(subscription.endpoint),
              'Content-Encoding': 'aes128gcm',
              'Content-Type': 'application/octet-stream',
              TTL: '300',
              Urgency: safePayload.urgency ?? 'normal',
            },
            body: toArrayBuffer(body),
          });
          if (response.ok) {
            summary.delivered += 1;
            return;
          }
          if (response.status === 404 || response.status === 410) {
            await this.removeEndpoint(subscription.endpoint);
            summary.removed += 1;
            return;
          }
          summary.failed += 1;
          this.logger.warn(`Web Push refusé avec le statut HTTP ${response.status}.`);
        } catch (error) {
          summary.failed += 1;
          this.logger.warn(
            `Échec Web Push : ${error instanceof Error ? error.message : 'erreur inconnue'}`,
          );
        }
      }),
    );
    return summary;
  }

  private encryptPayload(subscription: StoredPushSubscription, payload: HospitalPushPayload): Buffer {
    const clientPublicKey = decodeBase64Url(subscription.p256dh);
    const authSecret = decodeBase64Url(subscription.auth);
    if (clientPublicKey.length !== 65 || authSecret.length < 16) {
      throw new Error("Clés d’abonnement Web Push invalides.");
    }

    const sender = createECDH('prime256v1');
    sender.generateKeys();
    const senderPublicKey = sender.getPublicKey(undefined, 'uncompressed');
    const sharedSecret = sender.computeSecret(clientPublicKey);
    const authenticationPrk = hmac(authSecret, sharedSecret);
    const keyInfo = Buffer.concat([
      Buffer.from('WebPush: info\0', 'utf8'),
      clientPublicKey,
      senderPublicKey,
    ]);
    const inputKeyMaterial = expand(authenticationPrk, keyInfo, 32);
    const salt = randomBytes(16);
    const contentPrk = hmac(salt, inputKeyMaterial);
    const contentEncryptionKey = expand(
      contentPrk,
      Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'),
      16,
    );
    const nonce = expand(contentPrk, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);
    const plaintext = Buffer.concat([
      Buffer.from(JSON.stringify(payload), 'utf8'),
      Buffer.from([2]),
    ]);
    const cipher = createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    const header = Buffer.alloc(21);
    salt.copy(header, 0);
    header.writeUInt32BE(PUSH_RECORD_SIZE, 16);
    header.writeUInt8(senderPublicKey.length, 20);
    return Buffer.concat([header, senderPublicKey, ciphertext]);
  }

  private vapidAuthorization(endpoint: string): string {
    const audience = new URL(endpoint).origin;
    const header = base64Url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = base64Url(
      Buffer.from(
        JSON.stringify({
          aud: audience,
          exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
          sub: this.subject,
        }),
      ),
    );
    const unsignedToken = `${header}.${claims}`;
    const x = base64Url(this.publicKey.subarray(1, 33));
    const y = base64Url(this.publicKey.subarray(33, 65));
    const key = createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', d: base64Url(this.privateKey), x, y },
      format: 'jwk',
    });
    const signature = sign('sha256', Buffer.from(unsignedToken), {
      key,
      dsaEncoding: 'ieee-p1363',
    });
    return `vapid t=${unsignedToken}.${base64Url(signature)}, k=${base64Url(this.publicKey)}`;
  }

  private async removeEndpoint(endpoint: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "PushSubscription" WHERE "endpoint" = ${endpoint}
    `);
  }

  private async deliverPendingNotifications() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      await this.deliverPendingMessages();
      await this.deliverPendingAlerts();
    } catch (error) {
      this.logger.warn(
        `Traitement des notifications différées interrompu : ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      );
    } finally {
      this.pumping = false;
    }
  }

  private async deliverPendingMessages() {
    const rows = await this.prisma.$queryRaw<PendingMessageRow[]>(Prisma.sql`
      SELECT message."id", message."receiverId"
      FROM "Message" AS message
      INNER JOIN "User" AS recipient ON recipient."id" = message."receiverId"
      WHERE message."readAt" IS NULL
        AND message."pushNotifiedAt" IS NULL
        AND recipient."isActive" = true
      ORDER BY message."sentAt" ASC
      LIMIT 100
    `);
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      grouped.set(row.receiverId, [...(grouped.get(row.receiverId) ?? []), row.id]);
    }
    for (const [userId, messageIds] of grouped) {
      const result = await this.sendToUser(userId, {
        title: 'Nouveau message interne',
        body:
          messageIds.length > 1
            ? `Vous avez ${messageIds.length} nouveaux messages sécurisés.`
            : 'Vous avez reçu un nouveau message sécurisé.',
        url: '/messages',
        tag: 'internal-message',
        urgency: 'normal',
      });
      if (result.delivered > 0) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "Message"
          SET "pushNotifiedAt" = CURRENT_TIMESTAMP
          WHERE "id" IN (${Prisma.join(messageIds)})
        `);
      }
    }
  }

  private async deliverPendingAlerts() {
    const alerts = await this.prisma.$queryRaw<PendingAlertRow[]>(Prisma.sql`
      SELECT "id", "targetRole", "severity"::text AS "severity"
      FROM "EmergencyAlert"
      WHERE "status" = 'ACTIVE'
        AND "pushNotifiedAt" IS NULL
        AND ("expiresAt" IS NULL OR "expiresAt" > CURRENT_TIMESTAMP)
      ORDER BY "createdAt" ASC
      LIMIT 20
    `);
    for (const alert of alerts) {
      const payload: HospitalPushPayload = {
        title: "Alerte d’urgence",
        body: "Une alerte prioritaire nécessite votre attention. Ouvrez l’application hospitalière.",
        url: '/dashboard',
        tag: `emergency-${alert.id}`,
        urgency: alert.severity === 'CRITICAL' ? 'high' : 'normal',
      };
      const result = alert.targetRole
        ? await this.sendToRoles([alert.targetRole], payload)
        : await this.broadcast(payload);
      if (result.delivered > 0) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "EmergencyAlert"
          SET "pushNotifiedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${alert.id}
        `);
      }
    }
  }
}
