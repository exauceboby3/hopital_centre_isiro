import { CareAuthorizationStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientFinancialAccessService } from './patient-financial-access.service';

describe('PatientFinancialAccessService confidentialité de la fiche', () => {
  const service = new PatientFinancialAccessService({} as PrismaService);
  const authorization = {
    id: 'authorization-1',
    status: CareAuthorizationStatus.PENDING,
    invoiceId: 'invoice-1',
    invoiceNumber: 'FAC-2026-000004',
    amount: 5_000,
  };

  it('masque la référence et le montant à la réception', () => {
    const result = service.presentFileAuthorization(authorization, {
      id: 'reception-1',
      username: 'reception',
      role: Role.RECEPTIONIST,
      additionalRoles: [],
    });

    expect(result).toEqual({
      id: 'authorization-1',
      status: CareAuthorizationStatus.PENDING,
      paymentClearance: { inOrder: false, status: 'TO_REGULARIZE' },
    });
  });

  it('conserve les détails pour le comptable', () => {
    const result = service.presentFileAuthorization(authorization, {
      id: 'accountant-1',
      username: 'comptable',
      role: Role.ACCOUNTANT,
      additionalRoles: [],
    });

    expect(result).toHaveProperty('invoiceNumber', 'FAC-2026-000004');
    expect(result).toHaveProperty('amount', 5_000);
  });
});
