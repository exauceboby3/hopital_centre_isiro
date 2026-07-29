import { StockMovementType } from '@prisma/client';

export function stockDelta(type: StockMovementType, quantity: number): number {
  if (type === StockMovementType.EXIT) return -Math.abs(quantity);
  return quantity;
}
