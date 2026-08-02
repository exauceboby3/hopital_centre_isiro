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

  it('enregistre les champs vides du profil comme null et évite le conflit du numéro professionnel vide', async () => {
    const profile = {
      id: 'doctor-profile-1',
      userId: 'doctor-user-1',
      lastName: 'MALU',
      postName: null,
      firstName: null,
      specialty: 'Médecine générale',
      grade: null,
      licenseNumber: null,
      phone: null,
      address: null,
    };
    const user = {
      id: 'doctor-user-1',
      username: 'doctor1',
      role: Role.DOCTOR,
      additionalRoles: [],
      doctorProfile: profile,
      nurseProfile: null,
      secretaryProfile: null,
      labProfile: null,
      staffProfile: null,
    };
    const doctorUpdate = jest.fn().mockResolvedValue(profile);
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      doctorProfile: { update: doctorUpdate },
      nurseProfile: { update: jest.fn() },
      secretaryProfile: { update: jest.fn() },
      labTechnicianProfile: { update: jest.fn() },
      staffProfile: { update: jest.fn(), create: jest.fn() },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: user.id,
            username: user.username,
            role: user.role,
            additionalRoles: [],
            doctorProfile: profile,
          })
          .mockResolvedValueOnce(user)
          .mockResolvedValueOnce(user)
          .mockResolvedValueOnce(user),
      },
      customFieldValue: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await service.updateOwnProfile(user.id, {
      lastName: '  MALU  ',
      postName: ' ',
      firstName: '',
      specialty: ' Médecine interne ',
      grade: '',
      licenseNumber: ' ',
      phone: '',
      address: ' Isiro ',
    });

    expect(doctorUpdate).toHaveBeenCalledWith({
      where: { userId: user.id },
      data: {
        lastName: 'MALU',
        postName: null,
        firstName: null,
        phone: null,
        address: 'Isiro',
        specialty: 'Médecine interne',
        grade: null,
        licenseNumber: null,
      },
    });
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('refuse un nom vide lors de la mise à jour du profil', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            username: 'doctor',
            role: Role.DOCTOR,
            additionalRoles: [],
            doctorProfile: {},
          })
          .mockResolvedValueOnce({
            id: 'user-1',
            username: 'doctor',
            role: Role.DOCTOR,
            doctorProfile: {},
            nurseProfile: null,
            secretaryProfile: null,
            labProfile: null,
            staffProfile: null,
          }),
      },
    } as unknown as PrismaService;
    const service = new UsersService(prisma);

    await expect(service.updateOwnProfile('user-1', { lastName: ' ' })).rejects.toThrow(
      'Le nom doit contenir au moins 2 caractères.',
    );
  });

  it.each([
    ['médecin', Role.DOCTOR, 'doctorProfile', 'doctorProfile'],
    ['infirmier', Role.NURSE, 'nurseProfile', 'nurseProfile'],
    ['secrétaire', Role.SECRETARY, 'secretaryProfile', 'secretaryProfile'],
    ['laboratoire', Role.LAB_TECHNICIAN, 'labProfile', 'labTechnicianProfile'],
    ['ressources humaines', Role.HR, 'staffProfile', 'staffProfile'],
  ] as const)(
    'met à jour le profil %s avec journalisation',
    async (_label, role, profileKey, repositoryKey) => {
      const profile = {
        id: `profile-${role}`,
        userId: `user-${role}`,
        lastName: 'MALU',
        postName: null,
        firstName: 'Jean',
        specialty: 'Service test',
        grade: null,
        licenseNumber: null,
        educationLevel: null,
        phone: null,
        address: null,
      };
      const user = {
        id: profile.userId,
        username: role.toLowerCase(),
        role,
        additionalRoles: [],
        doctorProfile: null,
        nurseProfile: null,
        secretaryProfile: null,
        labProfile: null,
        staffProfile: null,
        [profileKey]: profile,
      };
      const repositories = {
        doctorProfile: { update: jest.fn().mockResolvedValue(profile) },
        nurseProfile: { update: jest.fn().mockResolvedValue(profile) },
        secretaryProfile: { update: jest.fn().mockResolvedValue(profile) },
        labTechnicianProfile: { update: jest.fn().mockResolvedValue(profile) },
        staffProfile: {
          update: jest.fn().mockResolvedValue(profile),
          create: jest.fn().mockResolvedValue(profile),
        },
        auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        customFieldValue: { findMany: jest.fn().mockResolvedValue([]) },
        $transaction: jest.fn((callback: (client: typeof repositories) => unknown) =>
          callback(repositories),
        ),
      } as unknown as PrismaService;
      const service = new UsersService(prisma);

      await service.updateOwnProfile(user.id, {
        lastName: ' MALU ',
        firstName: ' Jean ',
        specialty: ' Service test ',
      });

      expect(repositories[repositoryKey].update).toHaveBeenCalledTimes(1);
      expect(repositories.auditLog.create).toHaveBeenCalledTimes(1);
    },
  );

});
