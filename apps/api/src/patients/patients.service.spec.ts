import { Sex } from '@prisma/client';
import { ConfigurationService } from '../configuration/configuration.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';

describe('PatientsService', () => {
  it('attribue un numéro patient annuel, automatique et séquentiel', async () => {
    type SequenceInput = {
      where: { year: number };
      update: { lastValue: { increment: number } };
      create: { year: number; lastValue: number };
    };
    type PatientInput = { data: { medicalRecordNumber: string; lastName: string; sex: Sex } };
    const sequenceUpsert = jest
      .fn<Promise<{ lastValue: number }>, [SequenceInput]>()
      .mockResolvedValue({ lastValue: 42 });
    const patientCreate = jest
      .fn<Promise<{ id: string; medicalRecordNumber: string }>, [PatientInput]>()
      .mockResolvedValue({ id: 'patient-1', medicalRecordNumber: 'CHI-2026-000042' });
    const transaction = {
      patientNumberSequence: { upsert: sequenceUpsert },
      patient: { findFirst: jest.fn().mockResolvedValue(null), create: patientCreate },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const configuration = {
      saveValues: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConfigurationService;
    const service = new PatientsService(prisma, configuration);

    await service.create({ lastName: 'MALU', sex: Sex.FEMALE });

    const sequencePayload = sequenceUpsert.mock.calls[0]?.[0];
    const patientPayload = patientCreate.mock.calls[0]?.[0];
    if (!sequencePayload || !patientPayload) throw new Error('Création du patient non exécutée.');
    expect(sequencePayload.update).toEqual({ lastValue: { increment: 1 } });
    expect(patientPayload.data.medicalRecordNumber).toMatch(/^CHI-\d{4}-000042$/);
    expect(patientPayload.data).toMatchObject({ identityKey: null });
    expect(transaction.patient.findFirst).not.toHaveBeenCalled();
  });

  it('refuse un second dossier portant la même identité normalisée', async () => {
    const transaction = {
      patientNumberSequence: { upsert: jest.fn() },
      patient: {
        findFirst: jest.fn().mockResolvedValue({ medicalRecordNumber: 'CHI-2026-000007' }),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const configuration = {} as ConfigurationService;
    const service = new PatientsService(prisma, configuration);

    await expect(
      service.create({
        lastName: '  KABUYA ',
        postName: ' wa  ',
        firstName: 'Jean',
        dateOfBirth: '1992-05-12',
        sex: Sex.MALE,
      }),
    ).rejects.toThrow('CHI-2026-000007');
    expect(transaction.patient.create).not.toHaveBeenCalled();
    expect(transaction.patientNumberSequence.upsert).not.toHaveBeenCalled();
  });

  it('supprime définitivement le patient et toutes ses données liées', async () => {
    const deletableModels = [
      'customFieldValue',
      'labExamDocument',
      'dicomInstance',
      'prescriptionItem',
      'insuranceClaim',
      'insuranceCoverage',
      'voucherCoverage',
      'careAuthorization',
      'payment',
      'invoiceItem',
      'bloodTransfusion',
      'specialtyCase',
      'radiologyStudy',
      'nursingCare',
      'prescription',
      'careVoucher',
      'patientInsurance',
      'clinicalOrder',
      'invoice',
      'hospitalization',
      'examRequest',
      'vitalSign',
      'consultation',
      'appointment',
    ] as const;
    const delegates = Object.fromEntries(
      deletableModels.map((model) => [
        model,
        { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      ]),
    ) as Record<(typeof deletableModels)[number], { deleteMany: jest.Mock }>;
    const patientDelete = jest.fn().mockResolvedValue({ id: 'patient-1' });
    const auditCalls: Array<{ data: { userId: string; action: string } }> = [];
    const auditCreate = jest.fn(
      (args: { data: { userId: string; action: string } }) => {
        auditCalls.push(args);
        return Promise.resolve({ id: 'audit-1' });
      },
    );
    const bedUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      ...delegates,
      hospitalization: {
        ...delegates.hospitalization,
        findMany: jest.fn().mockResolvedValue([{ bedId: 'bed-1' }]),
      },
      bed: { updateMany: bedUpdateMany },
      patient: { delete: patientDelete },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      patient: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'patient-1',
          medicalRecordNumber: 'CHI-2026-000001',
          lastName: 'MALU',
          postName: 'WA',
          firstName: 'Jean',
        }),
      },
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const service = new PatientsService(prisma, {} as ConfigurationService);

    const result = await service.removePermanently(
      'patient-1',
      'super-user-1',
      'CHI-2026-000001',
      'Suppression demandée après contrôle administratif complet.',
    );

    expect(result).toMatchObject({
      success: true,
      deletedRecords: deletableModels.length + 1,
      patient: {
        medicalRecordNumber: 'CHI-2026-000001',
        displayName: 'MALU WA Jean',
      },
    });
    deletableModels.forEach((model) => expect(delegates[model].deleteMany).toHaveBeenCalled());
    expect(patientDelete).toHaveBeenCalledWith({ where: { id: 'patient-1' } });
    expect(bedUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'AVAILABLE' } }),
    );
    const auditCall = auditCalls.at(0);
    expect(auditCall).toBeDefined();
    expect(auditCall?.data.userId).toBe('super-user-1');
    expect(auditCall?.data.action).toBe('PATIENT_PERMANENTLY_DELETED');
  });
});
