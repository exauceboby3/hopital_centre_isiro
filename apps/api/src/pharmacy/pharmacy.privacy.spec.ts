import { Role } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyService confidentialité du catalogue clinique', () => {
  const createService = () => {
    const prisma = {
      medication: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'medication-1',
            name: 'Ceftriaxone',
            stockQuantity: 12,
            minimumStock: 5,
            unitPrice: 2_500,
          },
        ]),
      },
    } as unknown as PrismaService;
    return new PharmacyService(prisma, {} as FinancialAuthorizationService);
  };

  it('retire le prix pour le médecin prescripteur', async () => {
    const rows = await createService().list(false, {
      id: 'doctor-1',
      username: 'medecin',
      role: Role.DOCTOR,
      additionalRoles: [],
    });

    expect(rows[0]).toMatchObject({ id: 'medication-1', stockQuantity: 12 });
    expect(rows[0]).not.toHaveProperty('unitPrice');
  });

  it('conserve le prix pour le pharmacien', async () => {
    const rows = await createService().list(false, {
      id: 'pharmacist-1',
      username: 'pharmacien',
      role: Role.PHARMACIST,
      additionalRoles: [],
    });

    expect(rows[0]).toHaveProperty('unitPrice', 2_500);
  });
});
