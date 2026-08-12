import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { DashboardService } from './dashboard.service';

describe('DashboardService et cycle opérationnel', () => {
  const user: AuthenticatedUser = {
    id: 'super-admin-1',
    username: 'superadmin',
    role: Role.SUPER_ADMIN,
    additionalRoles: [],
  };

  function fixture(cycleStartedAt: Date | null) {
    type CountQuery = { where: Record<string, unknown> };
    type GroupQuery = { where: Record<string, unknown> };
    const patientCount = jest.fn<Promise<number>, [CountQuery]>().mockResolvedValue(0);
    const appointmentCount = jest.fn<Promise<number>, [CountQuery]>().mockResolvedValue(0);
    const appointmentGroupBy = jest.fn<Promise<unknown[]>, [GroupQuery]>().mockResolvedValue([]);
    const examRequestCount = jest.fn<Promise<number>, [CountQuery]>().mockResolvedValue(0);
    const hospitalizationCount = jest.fn<Promise<number>, [CountQuery]>().mockResolvedValue(0);
    const prisma = {
      auditLog: {
        findFirst: jest
          .fn()
          .mockResolvedValue(cycleStartedAt ? { createdAt: cycleStartedAt } : null),
      },
      patient: { count: patientCount },
      appointment: {
        count: appointmentCount,
        groupBy: appointmentGroupBy,
        findMany: jest.fn().mockResolvedValue([]),
      },
      consultation: { count: jest.fn().mockResolvedValue(0) },
      examRequest: { count: examRequestCount },
      hospitalization: { count: hospitalizationCount },
      bed: { count: jest.fn().mockResolvedValue(0) },
      invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }) },
      medication: {
        count: jest.fn().mockResolvedValue(0),
        fields: { minimumStock: 'minimumStock' },
      },
      message: { count: jest.fn().mockResolvedValue(0) },
      attendanceRecord: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      staffShift: { count: jest.fn().mockResolvedValue(0) },
      doctorProfile: { count: jest.fn().mockResolvedValue(0) },
    };
    const config = { get: jest.fn().mockReturnValue('120') };
    return { service: new DashboardService(prisma as never, config as never), prisma };
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-11T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('compte uniquement les activités créées après la réinitialisation', async () => {
    const cycleStartedAt = new Date('2026-08-11T09:00:00.000Z');
    const { service, prisma } = fixture(cycleStartedAt);

    const result = await service.summary(user);

    expect(prisma.patient.count).toHaveBeenCalledWith({
      where: { archivedAt: null, createdAt: { gt: cycleStartedAt } },
    });
    const appointmentQuery = prisma.appointment.count.mock.calls[0]?.[0];
    const examQuery = prisma.examRequest.count.mock.calls[0]?.[0];
    const hospitalizationQuery = prisma.hospitalization.count.mock.calls[0]?.[0];
    const journeyQuery = prisma.appointment.groupBy.mock.calls[0]?.[0];
    if (!appointmentQuery || !examQuery || !hospitalizationQuery || !journeyQuery) {
      throw new Error('Les requêtes du cycle opérationnel n’ont pas été exécutées.');
    }
    expect(appointmentQuery.where).toMatchObject({ createdAt: { gt: cycleStartedAt } });
    expect(examQuery.where).toMatchObject({ requestedAt: { gt: cycleStartedAt } });
    expect(hospitalizationQuery.where).toMatchObject({ admittedAt: { gt: cycleStartedAt } });
    expect(journeyQuery.where).toMatchObject({ createdAt: { gt: cycleStartedAt } });
    expect(result.operationalCycleStartedAt).toEqual(cycleStartedAt);
  });

  it('conserve le comportement historique avant la première réinitialisation', async () => {
    const { service, prisma } = fixture(null);

    await service.summary(user);

    expect(prisma.patient.count).toHaveBeenCalledWith({ where: { archivedAt: null } });
    const appointmentQuery = prisma.appointment.count.mock.calls[0]?.[0];
    if (!appointmentQuery) throw new Error('Le compteur des rendez-vous n’a pas été exécuté.');
    expect(appointmentQuery.where).not.toHaveProperty('createdAt');
  });
});
