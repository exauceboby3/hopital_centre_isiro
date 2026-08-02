import { ConflictException } from '@nestjs/common';
import {
  InvoiceStatus,
  PaymentPayer,
  Prisma,
  PrescriptionStatus,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { GraceAwareEnterpriseService } from './grace-aware-enterprise.service';

function prescriptionFixture() {
  return {
    id: 'rx-1',
    number: 'ORD-2026-0001',
    patientId: 'patient-1',
    invoiceId: 'invoice-1',
    status: PrescriptionStatus.ACTIVE,
    patient: { id: 'patient-1' },
    prescribedBy: { id: 'doctor-1', username: 'doctor', role: 'DOCTOR' },
    consultation: null,
    invoice: {
      id: 'invoice-1',
      number: 'FAC-2026-0001',
      status: InvoiceStatus.PAID,
      payments: [{ amount: new Prisma.Decimal(10), payerType: PaymentPayer.PATIENT }],
      insuranceCoverage: null,
    },
    items: [
      {
        id: 'item-1',
        medicationId: 'medication-1',
        quantity: 5,
        dispensedQuantity: 0,
        medication: { id: 'medication-1', name: 'Paracétamol' },
      },
    ],
  };
}

describe('GraceAwareEnterpriseService', () => {
  it('réclame l’ordonnance avant de décrémenter les lots et le stock', async () => {
    const prescription = prescriptionFixture();
    const prescriptionClaim = jest.fn().mockResolvedValue({ count: 1 });
    const batchClaim = jest.fn().mockResolvedValue({ count: 1 });
    const medicationClaim = jest.fn().mockResolvedValue({ count: 1 });
    const itemClaim = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      prescription: {
        findUnique: jest.fn().mockResolvedValue(prescription),
        updateMany: prescriptionClaim,
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...prescription,
          status: PrescriptionStatus.DISPENSED,
        }),
      },
      medicationBatch: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'batch-1',
            lotNumber: 'LOT-1',
            medicationId: 'medication-1',
            quantity: 10,
            receivedAt: new Date('2026-01-01'),
            expiresAt: new Date('2027-01-01'),
            isQuarantined: false,
          },
        ]),
        updateMany: batchClaim,
      },
      medication: { updateMany: medicationClaim },
      prescriptionItem: { updateMany: itemClaim },
      stockMovement: { create: jest.fn().mockResolvedValue({ id: 'movement-1' }) },
      auditLog: { create: jest.fn() },
    };
    const database = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const patientAccess = {
      activeGrace: jest.fn().mockResolvedValue(null),
      assertCareAccess: jest.fn().mockResolvedValue({ grace: null }),
    } as unknown as PatientFinancialAccessService;
    const service = new GraceAwareEnterpriseService(
      database,
      {} as FinancialAuthorizationService,
      patientAccess,
    );

    await service.dispensePrescription('rx-1', {}, 'pharmacist-1');

    const prescriptionCall = prescriptionClaim.mock.calls[0]?.[0] as unknown as {
      where: { id: string };
      data: { status: PrescriptionStatus };
    };
    const batchCall = batchClaim.mock.calls[0]?.[0] as unknown as {
      where: { quantity: { gte: number } };
    };
    const medicationCall = medicationClaim.mock.calls[0]?.[0] as unknown as {
      where: { stockQuantity: { gte: number } };
    };

    expect(prescriptionCall.where.id).toBe('rx-1');
    expect(prescriptionCall.data.status).toBe(PrescriptionStatus.DISPENSED);
    expect(batchCall.where.quantity.gte).toBe(5);
    expect(medicationCall.where.stockQuantity.gte).toBe(5);
    expect(prescriptionClaim.mock.invocationCallOrder[0]).toBeLessThan(
      batchClaim.mock.invocationCallOrder[0],
    );
  });

  it('arrête la délivrance lorsqu’une autre requête a déjà réclamé l’ordonnance', async () => {
    const prescription = prescriptionFixture();
    const transaction = {
      prescription: {
        findUnique: jest.fn().mockResolvedValue(prescription),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      medicationBatch: { findMany: jest.fn(), updateMany: jest.fn() },
      medication: { updateMany: jest.fn() },
      prescriptionItem: { updateMany: jest.fn() },
      stockMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const database = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const patientAccess = {
      activeGrace: jest.fn().mockResolvedValue(null),
      assertCareAccess: jest.fn().mockResolvedValue({ grace: null }),
    } as unknown as PatientFinancialAccessService;
    const service = new GraceAwareEnterpriseService(
      database,
      {} as FinancialAuthorizationService,
      patientAccess,
    );

    await expect(service.dispensePrescription('rx-1', {}, 'pharmacist-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(transaction.medicationBatch.findMany).not.toHaveBeenCalled();
    expect(transaction.medication.updateMany).not.toHaveBeenCalled();
  });
});
