import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';

describe('AuditInterceptor et cycle opérationnel', () => {
  type AuditCreateInput = { data: { action: string } };
  const auditCreate = jest.fn<Promise<unknown>, [AuditCreateInput]>().mockResolvedValue({});
  const prisma = { auditLog: { create: auditCreate } } as unknown as PrismaService;
  const interceptor = new AuditInterceptor(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ne double pas le repère explicite créé par une réinitialisation réussie', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/admin/operational-cycle/reset',
          method: 'POST',
          params: {},
          ip: '127.0.0.1',
          get: () => 'jest',
        }),
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of({ preservedData: true }) } as CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('ne recrée pas une activité après la purge complète', async () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          path: '/admin/operational-data/purge',
          method: 'POST',
          params: {},
          ip: '127.0.0.1',
          get: () => 'jest',
        }),
        getResponse: () => ({ statusCode: 201 }),
      }),
    } as unknown as ExecutionContext;
    const next = { handle: () => of({ preserved: { patients: 25 } }) } as CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(auditCreate).not.toHaveBeenCalled();
  });
});
