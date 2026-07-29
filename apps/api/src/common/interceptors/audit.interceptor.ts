import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../authenticated-user';
import { PrismaService } from '../../prisma/prisma.service';

interface AuditedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const highFrequencyFeed =
      request.path === '/messages/unread' ||
      request.path === '/alerts/active' ||
      request.path.startsWith('/health');
    if (['HEAD', 'OPTIONS'].includes(request.method) || highFrequencyFeed) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.writeLog(request, 'SUCCESS', response.statusCode),
        error: (error: { status?: number }) =>
          this.writeLog(request, 'FAILED', error.status ?? 500),
      }),
    );
  }

  private writeLog(request: AuditedRequest, outcome: 'SUCCESS' | 'FAILED', statusCode: number) {
    const segments = request.path.split('/').filter(Boolean);
    const entity = segments[0] === 'admin' ? (segments[1] ?? 'admin') : (segments[0] ?? 'unknown');
    const entityId = typeof request.params.id === 'string' ? request.params.id : undefined;
    void this.prisma.auditLog
      .create({
        data: {
          userId: request.user?.id,
          action: `${request.method}:${outcome}`,
          entity,
          entityId,
          ipAddress: request.ip,
          metadata: {
            path: request.path,
            role: request.user?.role,
            statusCode,
            userAgent: request.get('user-agent')?.slice(0, 255),
          },
        },
      })
      .catch((error: unknown) => this.logger.error('Échec de journalisation', error));
  }
}
