import { BadRequestException } from '@nestjs/common';
import { BillableServiceType, NursingCareStatus, NursingCareType, Role } from '@prisma/client';
import { NursingService } from './nursing.service';

const doctor = {
  id: 'doctor-1',
  username: 'medecin',
  role: Role.DOCTOR,
  additionalRoles: [],
};

const nurse = {
  id: 'nurse-1',
  username: 'infirmier',
  role: Role.NURSE,
  additionalRoles: [],
};

function fixture() {
  type NursingCareCreateInput = {
    data: Record<string, unknown>;
    include?: unknown;
  };
  type MessageCreateInput = {
    data: { receiverId: string; senderId: string; content: string };
  };
  type EmergencyAlertCreateInput = {
    data: Record<string, unknown>;
  };
  let createdCare = 0;
  const createCare = jest.fn<
    Promise<{ id: string } & Record<string, unknown>>,
    [NursingCareCreateInput]
  >(({ data }) =>
    Promise.resolve({
      id: `care-${++createdCare}`,
      ...data,
    }),
  );
  const transaction = {
    nursingCare: {
      create: createCare,
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'care-1' }),
    },
    patient: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        medicalRecordNumber: 'CHI-2026-000001',
        lastName: 'MALU',
        postName: null,
        firstName: 'Jean',
      }),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    message: {
      create: jest.fn<Promise<unknown>, [MessageCreateInput]>().mockResolvedValue({}),
      createMany: jest.fn(),
    },
    emergencyAlert: {
      create: jest.fn<Promise<unknown>, [EmergencyAlertCreateInput]>().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'patient-1' }) },
    consultation: { findUnique: jest.fn().mockResolvedValue(null) },
    hospitalization: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn(),
    },
    user: { findFirst: jest.fn().mockResolvedValue({ id: nurse.id }) },
    nursingCare: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((callback: (database: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  const financialAccess = { assertCareAccess: jest.fn().mockResolvedValue(undefined) };
  const governance = { medicationSignature: jest.fn().mockReturnValue('signature') };
  const service = new NursingService(
    prisma as never,
    financialAccess as never,
    governance as never,
  );
  return { service, prisma, transaction, financialAccess, governance };
}

describe('NursingService séquences infirmières', () => {
  it('programme toutes les administrations récurrentes et informe l’infirmier attribué', async () => {
    const { service, transaction, financialAccess } = fixture();
    const scheduledAt = '2026-08-05T08:00:00.000Z';

    await service.create(
      {
        patientId: 'patient-1',
        assignedNurseId: nurse.id,
        type: NursingCareType.MEDICATION,
        label: 'Paracétamol',
        medicationName: 'Paracétamol',
        dose: '500 mg',
        route: 'Orale',
        scheduledAt,
        frequencyHours: 8,
        durationDays: 1,
      },
      doctor,
    );

    expect(financialAccess.assertCareAccess).toHaveBeenCalledWith(
      'patient-1',
      BillableServiceType.PROCEDURE,
    );
    expect(transaction.nursingCare.create).toHaveBeenCalledTimes(3);
    expect(
      transaction.nursingCare.create.mock.calls.map(([call]) =>
        (call as { data: { scheduledAt: Date } }).data.scheduledAt.toISOString(),
      ),
    ).toEqual(['2026-08-05T08:00:00.000Z', '2026-08-05T16:00:00.000Z', '2026-08-06T00:00:00.000Z']);
    const notification = transaction.message.create.mock.calls[0]?.[0];
    if (!notification) throw new Error("La notification de l'infirmier n'a pas été créée.");
    expect(notification.data.receiverId).toBe(nurse.id);
    expect(notification.data.senderId).toBe(doctor.id);
  });

  it('refuse un programme incomplet ou supérieur à 500 administrations', async () => {
    const { service } = fixture();
    const base = {
      patientId: 'patient-1',
      type: NursingCareType.MONITORING,
      label: 'Surveillance',
      scheduledAt: '2026-08-05T08:00:00.000Z',
    };

    await expect(service.create({ ...base, frequencyHours: 8 }, doctor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.create({ ...base, frequencyHours: 1, durationDays: 90 }, doctor),
    ).rejects.toThrow('Le programme ne peut pas dépasser 500 administrations.');
  });

  it('enregistre le tour de salle et déclenche une alerte médicale pour un patient instable', async () => {
    const { service, prisma, transaction } = fixture();
    prisma.hospitalization.findFirst.mockResolvedValue({
      id: 'stay-1',
      patientId: 'patient-1',
      patient: { medicalRecordNumber: 'CHI-2026-000001' },
      bed: { code: 'LIT-01', room: { name: 'Médecine interne' } },
    });

    await service.recordWardRound(
      {
        patientId: 'patient-1',
        condition: 'Patient agité et dyspnéique',
        observations: 'Saturation en baisse',
        actions: 'Oxygène installé',
        vitalSigns: { oxygenPercent: 86 },
        unstable: true,
      },
      nurse,
    );

    const care = transaction.nursingCare.create.mock.calls[0]?.[0];
    if (!care) throw new Error("Le tour de salle n'a pas été enregistré.");
    expect(care.data).toMatchObject({
      patientId: 'patient-1',
      hospitalizationId: 'stay-1',
      performedById: nurse.id,
      status: NursingCareStatus.COMPLETED,
      type: NursingCareType.MONITORING,
    });
    expect(care.include).toBeDefined();

    const alert = transaction.emergencyAlert.create.mock.calls[0]?.[0];
    if (!alert) throw new Error("L'alerte médicale n'a pas été créée.");
    expect(alert.data).toMatchObject({
      patientId: 'patient-1',
      hospitalizationId: 'stay-1',
      targetRole: Role.DOCTOR,
      createdById: nurse.id,
    });
  });

  it('limite la liste d’un infirmier à ses soins et aux soins non attribués', async () => {
    const { service, prisma } = fixture();
    await service.list(nurse);
    expect(prisma.nursingCare.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ assignedNurseId: nurse.id }, { assignedNurseId: null }] },
      }),
    );
  });

  it('exige le double contrôle patient-médicament avant de terminer une administration', async () => {
    const { service, prisma } = fixture();
    prisma.nursingCare.findUnique.mockResolvedValue({
      id: 'care-1',
      patientId: 'patient-1',
      assignedNurseId: nurse.id,
      type: NursingCareType.MEDICATION,
      status: NursingCareStatus.SCHEDULED,
      scheduledAt: new Date('2026-08-05T08:00:00.000Z'),
      dose: '500 mg',
      route: 'Orale',
      startedAt: null,
    });

    await expect(
      service.update(
        'care-1',
        { status: NursingCareStatus.COMPLETED, administrationOutcome: 'ADMINISTERED' },
        nurse,
      ),
    ).rejects.toThrow('code du bracelet patient et le code du médicament');
  });

  it('exige un motif lorsque le médicament n’a pas été administré', async () => {
    const { service, prisma } = fixture();
    prisma.nursingCare.findUnique.mockResolvedValue({
      id: 'care-1',
      patientId: 'patient-1',
      assignedNurseId: nurse.id,
      type: NursingCareType.MEDICATION,
      status: NursingCareStatus.SCHEDULED,
      scheduledAt: new Date('2026-08-05T08:00:00.000Z'),
      dose: '500 mg',
      route: 'Orale',
      startedAt: null,
    });

    await expect(
      service.update(
        'care-1',
        { status: NursingCareStatus.MISSED, administrationOutcome: 'REFUSED' },
        nurse,
      ),
    ).rejects.toThrow('Le motif de non-administration est obligatoire.');
  });
});
