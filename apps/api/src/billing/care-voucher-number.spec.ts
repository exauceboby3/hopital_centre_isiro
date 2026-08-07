import { generateCareVoucherNumber } from './care-vouchers.service';

describe('generateCareVoucherNumber', () => {
  it('produit un numéro lisible avec l’année UTC et un suffixe normalisé', () => {
    expect(
      generateCareVoucherNumber(
        new Date('2026-12-31T23:59:59.000Z'),
        '12345678-abcd-4abc-9def-1234567890ab',
      ),
    ).toBe('BON-2026-12345678AB');
  });

  it('produit des numéros distincts pour des entropies distinctes', () => {
    const now = new Date('2026-08-07T08:00:00.000Z');
    expect(generateCareVoucherNumber(now, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).not.toBe(
      generateCareVoucherNumber(now, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
    );
  });
});
