import { CareAuthorizationStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialAuthorizationService } from './financial-authorization.service';
import { PatientFinancialAccessService } from './patient-financial-access.service';

describe('FinancialAuthorizationService confidentialité', () => {
  const authorization = {
    id: 'authorization-1',
    patientId: 'patient-1',
    invoiceId: 'invoice-1',
    amount: 50_000,
    status: CareAuthorizationStatus.AUTHORIZED,
    patient: { id: 'patient-1', medicalRecordNumber: 'CHI-2026-000001' },
    invoice: {
      id: 'invoice-1',
      number: 'FAC-2026-000001',
      total: 50_000,
      items: [{ description: 'Hospitalisation', total: 50_000 }],
      payments: [{ amount: 50_000 }],
    },
    medication: { id: 'medication-1', name: 'Produit', unitPrice: 5_000 },
    service: { id: 'service-1', name: 'Hospitalisation', price: 50_000 },
    createdBy: { id: 'cashier-1', username: 'caisse' },
    waivedBy: null,
    hospitalization: null,
  };

  const createService = () => {
    const prisma = {
      careAuthorization: { findMany: jest.fn().mockResolvedValue([authorization]) },
      billableService: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'service-1', name: 'Consultation', type: 'CONSULTATION', price: 20_000 },
          ]),
      },
    } as unknown as PrismaService;
    return new FinancialAuthorizationService(prisma, {} as PatientFinancialAccessService);
  };

  it('ne transmet au soignant que la validation du paiement', async () => {
    const rows = await createService().listAuthorizations(
      {},
      { id: 'doctor-1', username: 'medecin', role: Role.DOCTOR, additionalRoles: [] },
    );

    expect(rows[0]).toMatchObject({
      id: 'authorization-1',
      paymentClearance: { inOrder: true, status: 'IN_ORDER' },
    });
    expect(rows[0]).not.toHaveProperty('invoice');
    expect(rows[0]).not.toHaveProperty('invoiceId');
    expect(rows[0]).not.toHaveProperty('amount');
    expect(rows[0]).not.toHaveProperty('service');
    expect(rows[0]).not.toHaveProperty('medication');
  });

  it('conserve les détails pour la caisse', async () => {
    const rows = await createService().listAuthorizations(
      {},
      { id: 'cashier-1', username: 'caisse', role: Role.CASHIER, additionalRoles: [] },
    );

    expect(rows[0]).toHaveProperty('invoice.number', 'FAC-2026-000001');
    expect(rows[0]).toHaveProperty('amount', 50_000);
  });

  it('retire les prix du catalogue transmis à un soignant', async () => {
    const rows = await createService().listServices('CONSULTATION', false, {
      id: 'doctor-1',
      username: 'medecin',
      role: Role.DOCTOR,
      additionalRoles: [],
    });

    expect(rows[0]).toMatchObject({ id: 'service-1', name: 'Consultation' });
    expect(rows[0]).not.toHaveProperty('price');
  });

  it('conserve les prix du catalogue pour la caisse', async () => {
    const rows = await createService().listServices('CONSULTATION', false, {
      id: 'cashier-1',
      username: 'caisse',
      role: Role.CASHIER,
      additionalRoles: [],
    });

    expect(rows[0]).toHaveProperty('price', 20_000);
  });
});
