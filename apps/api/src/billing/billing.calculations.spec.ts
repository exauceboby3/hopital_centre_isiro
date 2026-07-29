import { InvoiceStatus } from '@prisma/client';
import { calculateInvoiceTotal, paymentStatus } from './billing.calculations';

describe('calculs de facturation', () => {
  it('calcule le total de toutes les lignes', () => {
    expect(
      calculateInvoiceTotal([
        { quantity: 2, unitPrice: 1500 },
        { quantity: 1, unitPrice: 2500 },
      ]),
    ).toBe(5500);
  });

  it.each([
    [10000, 0, InvoiceStatus.PENDING],
    [10000, 4000, InvoiceStatus.PARTIALLY_PAID],
    [10000, 10000, InvoiceStatus.PAID],
  ])('détermine le statut du paiement', (total, paid, expected) => {
    expect(paymentStatus(total, paid)).toBe(expected);
  });
});
