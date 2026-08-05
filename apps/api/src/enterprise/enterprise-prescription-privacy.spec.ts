import { InvoiceStatus, Role } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseService confidentialité des ordonnances', () => {
  const service = new EnterpriseService({} as PrismaService, {} as FinancialAuthorizationService);
  const prescription = {
    id: 'prescription-1',
    invoiceId: 'invoice-1',
    invoice: {
      id: 'invoice-1',
      number: 'FAC-2026-000001',
      status: InvoiceStatus.PAID,
      payments: [],
      insuranceCoverage: null,
    },
    items: [
      {
        id: 'item-1',
        medication: { id: 'medication-1', name: 'Produit', stockQuantity: 12, unitPrice: 5_000 },
      },
    ],
  };

  it('masque la facture et le prix au médecin', () => {
    const result = service.presentPrescription(prescription as never, {
      id: 'doctor-1',
      username: 'medecin',
      role: Role.DOCTOR,
      additionalRoles: [],
    });

    expect(result).not.toHaveProperty('invoice');
    expect(result).not.toHaveProperty('invoiceId');
    expect(result).toHaveProperty('paymentClearance.inOrder', true);
    expect(result).not.toHaveProperty('items.0.medication.unitPrice');
  });

  it('conserve la facture pour l’administration', () => {
    const result = service.presentPrescription(prescription as never, {
      id: 'admin-1',
      username: 'admin',
      role: Role.ADMIN,
      additionalRoles: [],
    });

    expect(result).toHaveProperty('invoice.number', 'FAC-2026-000001');
    expect(result).toHaveProperty('items.0.medication.unitPrice', 5_000);
  });

  it('masque la facture et le tarif d’un dossier spécialisé au personnel clinique', () => {
    const result = service.presentClinicalRecord(
      {
        id: 'specialty-1',
        clinicalOrder: {
          id: 'order-1',
          service: { id: 'service-1', name: 'Chirurgie', price: 75_000 },
          careAuthorization: {
            id: 'authorization-1',
            status: 'AUTHORIZED',
            amount: 75_000,
            invoice: { id: 'invoice-1', number: 'FAC-2026-000002' },
          },
        },
      } as never,
      { id: 'nurse-1', username: 'infirmier', role: Role.NURSE, additionalRoles: [] },
    );

    expect(result).not.toHaveProperty('clinicalOrder.service.price');
    expect(result).not.toHaveProperty('clinicalOrder.careAuthorization.invoice');
    expect(result).not.toHaveProperty('clinicalOrder.careAuthorization.amount');
    expect(result).toHaveProperty('clinicalOrder.careAuthorization.paymentClearance.inOrder', true);
  });
});
