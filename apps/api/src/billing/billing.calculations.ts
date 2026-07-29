import { InvoiceStatus } from '@prisma/client';

export interface BillableItem {
  quantity: number;
  unitPrice: number;
}

export function calculateInvoiceTotal(items: BillableItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function paymentStatus(total: number, amountPaid: number): InvoiceStatus {
  if (amountPaid >= total) return InvoiceStatus.PAID;
  if (amountPaid > 0) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.PENDING;
}
