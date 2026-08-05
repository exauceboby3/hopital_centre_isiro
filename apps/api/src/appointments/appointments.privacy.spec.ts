import { CareAuthorizationStatus, Role } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

describe('AppointmentsService confidentialité financière', () => {
  const appointment = {
    id: 'appointment-1',
    scheduledAt: new Date('2026-08-05T08:00:00.000Z'),
    patient: { id: 'patient-1', vitalSigns: [] },
    doctor: null,
    createdBy: { id: 'reception-1', username: 'reception' },
    consultation: null,
    careAuthorization: {
      id: 'authorization-1',
      status: CareAuthorizationStatus.AUTHORIZED,
      invoiceId: 'invoice-1',
      amount: 20_000,
      invoice: { id: 'invoice-1', number: 'FAC-2026-000003', payments: [] },
      service: { id: 'service-1', name: 'Consultation', price: 20_000 },
    },
  };

  const createService = () => {
    const prisma = {
      appointment: { findMany: jest.fn().mockResolvedValue([appointment]) },
    } as unknown as PrismaService;
    return new AppointmentsService(prisma, {} as FinancialAuthorizationService);
  };

  it('ne transmet à la réception que l’état du paiement', async () => {
    const rows = await createService().list(undefined, undefined, undefined, 'active', {
      id: 'reception-1',
      username: 'reception',
      role: Role.RECEPTIONIST,
      additionalRoles: [],
    });

    expect(rows[0]).not.toHaveProperty('careAuthorization.invoice');
    expect(rows[0]).not.toHaveProperty('careAuthorization.invoiceId');
    expect(rows[0]).not.toHaveProperty('careAuthorization.amount');
    expect(rows[0]).not.toHaveProperty('careAuthorization.service.price');
    expect(rows[0]).toHaveProperty('careAuthorization.paymentClearance.inOrder', true);
  });

  it('conserve les détails pour un administrateur', async () => {
    const rows = await createService().list(undefined, undefined, undefined, 'active', {
      id: 'admin-1',
      username: 'admin',
      role: Role.ADMIN,
      additionalRoles: [],
    });

    expect(rows[0]).toHaveProperty('careAuthorization.invoice.number', 'FAC-2026-000003');
    expect(rows[0]).toHaveProperty('careAuthorization.service.price', 20_000);
  });
});
