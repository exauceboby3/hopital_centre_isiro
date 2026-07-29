import { StockMovementType } from '@prisma/client';
import { stockDelta } from './stock.calculations';

describe('stockDelta', () => {
  it('ajoute les entrées', () => {
    expect(stockDelta(StockMovementType.ENTRY, 12)).toBe(12);
  });

  it('soustrait toujours les sorties', () => {
    expect(stockDelta(StockMovementType.EXIT, 7)).toBe(-7);
  });

  it('préserve le signe des ajustements', () => {
    expect(stockDelta(StockMovementType.ADJUSTMENT, -3)).toBe(-3);
  });
});
