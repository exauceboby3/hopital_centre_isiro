import { InvoiceStatus, Prisma, PrescriptionAvailability } from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { PrismaService } from '../prisma/prisma.service';
import { EnterpriseService } from './enterprise.service';

describe('EnterpriseService prescriptions externes', () => {
  it('enregistre un médicament non référencé sans facturer ni diminuer le stock', async () => {
    type InvoiceCreateInput = { data: { status: InvoiceStatus; total: Prisma.Decimal; items: { create: Array<{ description: string; unitPrice: Prisma.Decimal }> } } };
    type PrescriptionCreateInput = { data: { items: { create: Array<{ medicationId: string | null; medicationName: string; availability: PrescriptionAvailability }> } } };
    const invoiceCreate = jest.fn<Promise<{ id: string }>, [InvoiceCreateInput]>().mockResolvedValue({ id: 'invoice-1' });
    const prescriptionCreate = jest.fn<Promise<unknown>, [PrescriptionCreateInput]>().mockResolvedValue({ id: 'rx-1' });
    const transaction = {
      invoice: { create: invoiceCreate },
      prescription: { create: prescriptionCreate },
    };
    const prisma = {
      prescription: { findFirst: jest.fn().mockResolvedValue(null) },
      patient: { findUnique: jest.fn().mockResolvedValue({ id: 'patient-1' }) },
      consultation: { findUnique: jest.fn().mockResolvedValue({ id: 'consultation-1', patientId: 'patient-1' }) },
      medication: { findMany: jest.fn().mockResolvedValue([]) },
      drugInteraction: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction),
    } as unknown as PrismaService;
    const service = new EnterpriseService(prisma, {} as FinancialAuthorizationService);

    await service.createPrescription(
      {
        patientId: 'patient-1',
        consultationId: 'consultation-1',
        items: [
          {
            medicationName: 'Produit externe',
            form: 'Comprimé',
            strength: '500 mg',
            availability: PrescriptionAvailability.NON_CATALOGUED,
            externalReason: 'Non disponible dans le stock hospitalier',
            dosage: '1 comprimé',
            frequency: '2 fois par jour',
            route: 'Orale',
            durationDays: 5,
            quantity: 10,
          },
        ],
      },
      'doctor-1',
    );

    const invoice = invoiceCreate.mock.calls[0]?.[0];
    const prescription = prescriptionCreate.mock.calls[0]?.[0];
    if (!invoice || !prescription) throw new Error('Écritures manquantes.');
    expect(invoice.data.status).toBe(InvoiceStatus.PAID);
    expect(Number(invoice.data.total)).toBe(0);
    expect(Number(invoice.data.items.create[0]?.unitPrice)).toBe(0);
    expect(invoice.data.items.create[0]?.description).toContain('achat externe');
    expect(prescription.data.items.create[0]).toMatchObject({
      medicationId: null,
      medicationName: 'Produit externe',
      availability: PrescriptionAvailability.NON_CATALOGUED,
    });
  });
});
