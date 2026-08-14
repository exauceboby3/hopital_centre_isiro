import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { OPERATIONAL_CYCLE_RESET_ACTION } from '../common/hospital-time';
import { AdminService } from './admin.service';

describe('cycle opérationnel', () => {
  const actor: AuthenticatedUser = {
    id: 'super-admin-1',
    username: 'superadmin',
    role: Role.SUPER_ADMIN,
    additionalRoles: [],
  };

  function fixture() {
    const markerDate = new Date('2026-08-11T08:00:00.000Z');
    const prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'marker-1', createdAt: markerDate }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      idempotencyRecord: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    return { service: new AdminService(prisma as never), prisma, markerDate };
  }

  it('démarre un nouveau cycle sans supprimer les données existantes', async () => {
    const { service, prisma, markerDate } = fixture();

    await expect(
      service.resetOperationalCycle({ confirmation: 'REINITIALISER' }, actor),
    ).resolves.toEqual({ cycleStartedAt: markerDate, preservedData: true });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: actor.id,
        action: OPERATIONAL_CYCLE_RESET_ACTION,
        entity: 'operational-cycle',
        metadata: {
          preservedData: true,
          counters: [
            'patients',
            'appointments',
            'consultations',
            'laboratory',
            'hospitalizations',
            'patientJourneys',
          ],
          message: 'Début d’un nouveau cycle opérationnel',
        },
      },
      select: { id: true, createdAt: true },
    });
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('refuse une confirmation incorrecte', async () => {
    const { service, prisma } = fixture();

    await expect(
      service.resetOperationalCycle({ confirmation: 'EFFACER' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('préserve les repères de cycle lors du nettoyage des anciennes traces', async () => {
    const { service, prisma } = fixture();

    await service.cleanupAuditLogs({
      before: '2026-08-10T00:00:00.000Z',
      confirmation: 'NETTOYER',
    });

    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: new Date('2026-08-10T00:00:00.000Z') },
        action: { not: OPERATIONAL_CYCLE_RESET_ACTION },
      },
    });
  });

  it('efface les activités mais conserve les référentiels demandés', async () => {
    const markerDate = new Date('2026-08-14T13:30:00.000Z');
    const executeRawUnsafe = jest.fn().mockResolvedValue(1);
    const medicationUpdateMany = jest.fn().mockResolvedValue({ count: 12 });
    const bedUpdateMany = jest.fn().mockResolvedValue({ count: 8 });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'marker-2', createdAt: markerDate });
    const transaction = {
      patient: { count: jest.fn().mockResolvedValue(25) },
      user: { count: jest.fn().mockResolvedValue(10) },
      medication: { count: jest.fn().mockResolvedValue(12), updateMany: medicationUpdateMany },
      billableService: { count: jest.fn().mockResolvedValue(6) },
      bed: { updateMany: bedUpdateMany },
      auditLog: { create: auditCreate },
      $executeRawUnsafe: executeRawUnsafe,
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    };
    const service = new AdminService(prisma as never);

    await expect(
      service.purgeOperationalData(
        { confirmation: 'EFFACER TOUTES LES ACTIVITES' },
        actor,
      ),
    ).resolves.toEqual({
      cycleStartedAt: markerDate,
      preserved: { patients: 25, users: 10, medications: 12, billableServices: 6 },
    });
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
    expect(medicationUpdateMany).toHaveBeenCalledWith({ data: { stockQuantity: 0 } });
    expect(bedUpdateMany).toHaveBeenCalledWith({ data: { status: 'AVAILABLE' } });
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });
});
