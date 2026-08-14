import { StockMovementType } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyService.create', () => {
  it('enregistre le stock initial et son mouvement dans la même transaction', async () => {
    type MedicationCreateInput = { data: { code: string; stockQuantity: number } };
    const medicationCreate = jest.fn<Promise<{ id: string }>, [MedicationCreateInput]>();
    medicationCreate.mockResolvedValue({ id: 'medication-1' });
    const movementCreate = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const transaction = {
      medication: { create: medicationCreate },
      stockMovement: { create: movementCreate },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const service = new PharmacyService(prisma, {} as FinancialAuthorizationService);

    await service.create(
      {
        code: ' para-500 ',
        name: 'Paracétamol',
        minimumStock: 10,
        initialStock: 50,
        unitPrice: 500,
      },
      'pharmacist-1',
    );

    expect(medicationCreate.mock.calls[0]?.[0].data).toMatchObject({
      code: 'PARA-500',
      stockQuantity: 50,
    });
    expect(movementCreate).toHaveBeenCalledWith({
      data: {
        medicationId: 'medication-1',
        userId: 'pharmacist-1',
        type: StockMovementType.ENTRY,
        quantity: 50,
        reason: 'Stock initial à la création du médicament',
      },
    });
  });
});

describe('PharmacyService.deactivate', () => {
  it('retire le médicament du stock actif sans supprimer son historique', async () => {
    const medicationUpdate = jest.fn().mockResolvedValue({ id: 'medication-1' });
    const auditCreate = jest.fn().mockResolvedValue({ id: 'audit-1' });
    const transaction = {
      medication: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'medication-1',
          code: 'PARA-500',
          name: 'Paracétamol',
          stockQuantity: 12,
        }),
        update: medicationUpdate,
      },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    } as unknown as PrismaService;
    const service = new PharmacyService(prisma, {} as FinancialAuthorizationService);

    await expect(service.deactivate('medication-1', 'pharmacist-1')).resolves.toEqual({
      id: 'medication-1',
      isActive: false,
    });
    expect(medicationUpdate).toHaveBeenCalledWith({
      where: { id: 'medication-1' },
      data: { isActive: false },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: 'pharmacist-1',
        action: 'MEDICATION_DEACTIVATED',
        entity: 'Medication',
        entityId: 'medication-1',
        metadata: {
          code: 'PARA-500',
          name: 'Paracétamol',
          stockQuantity: 12,
        },
      },
    });
  });
});
