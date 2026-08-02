import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const auditCreate = jest.fn().mockResolvedValue({});
  const getAllAndOverride = jest.fn<Role[] | undefined, unknown[]>();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;
  const prisma = {
    auditLog: { create: auditCreate },
  } as unknown as PrismaService;
  const guard = new RolesGuard(reflector, prisma);

  const context = (role: Role, additionalRoles: Role[] = []) =>
    ({
      getHandler: () => 'handler',
      getClass: () => 'controller',
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          path: '/test/action',
          ip: '127.0.0.1',
          user: { id: 'user-1', username: 'test', role, additionalRoles },
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('autorise un rôle supplémentaire attribué au compte', () => {
    getAllAndOverride.mockReturnValue([Role.RECEPTIONIST]);

    expect(guard.canActivate(context(Role.NURSE, [Role.RECEPTIONIST]))).toBe(true);
  });

  it('autorise le super-administrateur sur toutes les fonctions', () => {
    getAllAndOverride.mockReturnValue([Role.DOCTOR]);

    expect(guard.canActivate(context(Role.SUPER_ADMIN))).toBe(true);
  });


  it('refuse un administrateur lorsque le rôle métier n’est pas explicitement autorisé', () => {
    getAllAndOverride.mockReturnValue([Role.CASHIER]);

    expect(() => guard.canActivate(context(Role.ADMIN))).toThrow(ForbiddenException);
  });

  it('autorise un administrateur uniquement lorsque ADMIN est déclaré', () => {
    getAllAndOverride.mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(context(Role.ADMIN))).toBe(true);
  });

  it('réserve les actions super-administrateur au super-administrateur', () => {
    getAllAndOverride.mockReturnValue([Role.SUPER_ADMIN]);

    expect(() => guard.canActivate(context(Role.ADMIN))).toThrow(ForbiddenException);
  });

  it('indique clairement les rôles requis et les rôles du compte', () => {
    getAllAndOverride.mockReturnValue([Role.CASHIER]);

    try {
      guard.canActivate(context(Role.NURSE));
      throw new Error("L'accès aurait dû être refusé.");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse() as {
        code: string;
        message: string;
      };
      expect(response.code).toBe('ROLE_REQUIRED');
      expect(response.message).toContain('Caissier');
      expect(response.message).toContain('Infirmier');
    }
  });
});
