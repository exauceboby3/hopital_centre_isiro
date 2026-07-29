import { calculateVoucherSplit } from './care-voucher.calculations';

describe('calcul des bons de soins', () => {
  it('couvre intégralement un patient avec un bon à 100 %', () => {
    expect(calculateVoucherSplit(25000, 100)).toMatchObject({
      patientAmount: 0,
      sponsorAmount: 25000,
    });
  });

  it('calcule la part patient selon le pourcentage', () => {
    expect(calculateVoucherSplit(50000, 80)).toMatchObject({
      patientAmount: 10000,
      sponsorAmount: 40000,
    });
  });

  it('respecte le plafond restant du bon', () => {
    expect(calculateVoucherSplit(50000, 100, 60000, 30000)).toMatchObject({
      patientAmount: 20000,
      sponsorAmount: 30000,
      remainingCeiling: 30000,
    });
  });
});
