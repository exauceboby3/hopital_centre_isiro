import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../authenticated-user';

type IdempotentRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const key = request.get('x-idempotency-key');
    const user = request.user;
    if (!key || !user || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return next.handle();
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      throw new ConflictException("La clé d'idempotence est invalide.");
    }
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { key } });
    if (existing) {
      if (
        existing.userId !== user.id ||
        existing.method !== request.method ||
        existing.path !== request.path
      ) {
        throw new ConflictException("Cette clé d'idempotence appartient à une autre opération.");
      }
      if (!existing.completedAt) {
        throw new ConflictException('Cette opération est déjà en cours de traitement.');
      }
      return of(existing.response);
    }
    await this.prisma.idempotencyRecord.create({
      data: {
        key,
        userId: user.id,
        method: request.method,
        path: request.path,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    return next.handle().pipe(
      catchError((error: unknown) =>
        from(this.prisma.idempotencyRecord.deleteMany({ where: { key, completedAt: null } })).pipe(
          mergeMap(() => throwError(() => error)),
        ),
      ),
      mergeMap((value: unknown) =>
        from(
          this.prisma.idempotencyRecord.update({
            where: { key },
            data: {
              response:
                value === undefined
                  ? Prisma.JsonNull
                  : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue),
              completedAt: new Date(),
            },
          }),
        ).pipe(mergeMap(() => of(value))),
      ),
    );
  }
}
