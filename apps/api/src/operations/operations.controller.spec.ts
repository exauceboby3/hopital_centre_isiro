import { CareAuthorizationStatus, Role } from '@prisma/client';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

describe('OperationsController confidentialité clinique', () => {
  const order = {
    id: 'order-1',
    service: { id: 'service-1', name: 'Radiologie', price: 40_000 },
    careAuthorization: {
      id: 'authorization-1',
      status: CareAuthorizationStatus.AUTHORIZED,
      amount: 40_000,
      invoice: {
        id: 'invoice-1',
        number: 'FAC-2026-000001',
        total: 40_000,
        payments: [{ amount: 40_000 }],
      },
    },
  };

  const controller = new OperationsController({
    clinicalOrders: jest.fn().mockResolvedValue([order]),
  } as unknown as OperationsService);

  it('remplace la facture par un simple état de paiement pour le soignant', async () => {
    const result = await controller.clinicalOrders(
      {},
      { id: 'doctor-1', username: 'medecin', role: Role.DOCTOR, additionalRoles: [] },
    );

    expect(result[0]).toMatchObject({
      service: { id: 'service-1', name: 'Radiologie' },
      careAuthorization: {
        id: 'authorization-1',
        status: CareAuthorizationStatus.AUTHORIZED,
        paymentClearance: { inOrder: true, status: 'IN_ORDER' },
      },
    });
    expect(result[0]).not.toHaveProperty('service.price');
    expect(result[0]).not.toHaveProperty('careAuthorization.invoice');
    expect(result[0]).not.toHaveProperty('careAuthorization.amount');
  });

  it('conserve les détails pour un administrateur', async () => {
    const result = await controller.clinicalOrders(
      {},
      { id: 'admin-1', username: 'admin', role: Role.ADMIN, additionalRoles: [] },
    );

    expect(result[0]).toHaveProperty('service.price', 40_000);
    expect(result[0]).toHaveProperty('careAuthorization.invoice.number', 'FAC-2026-000001');
  });
});
