import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it("recherche le nom d'utilisateur sans tenir compte de la casse ni des espaces", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new UsersService({ user: { findFirst } } as unknown as PrismaService);

    await service.findByUsername('  RecepTion  ');

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        username: {
          equals: 'RecepTion',
          mode: 'insensitive',
        },
      },
    });
  });

  it('masque le super-administrateur dans les listes visibles par un administrateur', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]);
    const service = new UsersService({ user: { findMany } } as unknown as PrismaService);

    await service.listActive({
      id: 'admin-1',
      username: 'direction',
      role: Role.ADMIN,
      additionalRoles: [Role.DOCTOR],
    });

    const call = findMany.mock.calls[0]?.[0] as {
      where: { role?: { not: Role } };
    };
    expect(call.where.role).toEqual({ not: Role.SUPER_ADMIN });
  });

  it('laisse le super-administrateur voir les autres super-administrateurs', async () => {
    const findMany = jest.fn<Promise<unknown[]>, [unknown]>().mockResolvedValue([]);
    const service = new UsersService({ user: { findMany } } as unknown as PrismaService);

    await service.listActive({
      id: 'super-1',
      username: 'super',
      role: Role.SUPER_ADMIN,
      additionalRoles: [],
    });

    const call = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('role');
  });

  it('modifie son propre mot de passe et révoque toutes les sessions', async () => {
    const currentHash = await argon2.hash('AncienMotDePasse!');
    type UserUpdatePayload = { where: { id: string }; data: { passwordHash: string } };
    type SessionUpdatePayload = {
      where: { userId: string; revokedAt: null };
      data: { revokedAt: Date };
    };
    const userUpdate = jest.fn<Promise<unknown>, [UserUpdatePayload]>().mockResolvedValue({});
    const sessionUpdateMany = jest
      .fn<Promise<{ count: number }>, [SessionUpdatePayload]>()
      .mockResolvedValue({ count: 2 });
    const transaction = {
      user: { update: userUpdate },
      authSession: { updateMany: sessionUpdateMany },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', passwordHash: currentHash }),
      },
      $transaction: jest.fn((callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await service.changeOwnPassword('user-1', {
      currentPassword: 'AncienMotDePasse!',
      newPassword: 'NouveauMotDePasse!2026',
    });

    const userUpdatePayload = userUpdate.mock.calls[0]?.[0];
    if (!userUpdatePayload) throw new Error('La mise à jour utilisateur n’a pas été appelée.');
    expect(userUpdatePayload.where).toEqual({ id: 'user-1' });
    expect(typeof userUpdatePayload.data.passwordHash).toBe('string');

    const sessionUpdatePayload = sessionUpdateMany.mock.calls[0]?.[0];
    if (!sessionUpdatePayload) throw new Error('La révocation des sessions n’a pas été appelée.');
    expect(sessionUpdatePayload.where).toEqual({ userId: 'user-1', revokedAt: null });
    expect(sessionUpdatePayload.data.revokedAt).toBeInstanceOf(Date);
  });

  it('refuse un changement lorsque le mot de passe actuel est incorrect', async () => {
    const currentHash = await argon2.hash('AncienMotDePasse!');
    const service = new UsersService({
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', passwordHash: currentHash }),
      },
    } as unknown as PrismaService);

    await expect(
      service.changeOwnPassword('user-1', {
        currentPassword: 'MauvaisMotDePasse!',
        newPassword: 'NouveauMotDePasse!2026',
      }),
    ).rejects.toThrow('Le mot de passe actuel est incorrect.');
  });
});
