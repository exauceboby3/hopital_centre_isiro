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
