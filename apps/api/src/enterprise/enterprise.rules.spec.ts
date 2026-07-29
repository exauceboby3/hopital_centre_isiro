import { SpecialtyCaseStatus } from '@prisma/client';
import {
  calculateInsuranceSplit,
  calculateNetSalary,
  canTransitionSpecialtyCase,
  isBalancedJournal,
} from './enterprise.rules';

describe('enterprise rules', () => {
  it('répartit une facture entre patient et assureur sans perdre de centime', () => {
    const result = calculateInsuranceSplit(125000, 80);
    expect(result).toEqual({ coveragePercent: 80, insurerAmount: 100000, patientAmount: 25000 });
    expect(result.insurerAmount + result.patientAmount).toBe(125000);
  });

  it('calcule le salaire net', () => {
    expect(
      calculateNetSalary({
        baseSalary: 500,
        allowances: 100,
        overtime: 50,
        deductions: 25,
        taxes: 75,
      }),
    ).toBe(550);
  });

  it('refuse une écriture comptable déséquilibrée', () => {
    expect(
      isBalancedJournal([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).toBe(true);
    expect(
      isBalancedJournal([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    ).toBe(false);
  });

  it('impose la séquence des dossiers spécialisés', () => {
    expect(
      canTransitionSpecialtyCase(SpecialtyCaseStatus.IN_PROGRESS, SpecialtyCaseStatus.COMPLETED),
    ).toBe(true);
    expect(
      canTransitionSpecialtyCase(SpecialtyCaseStatus.OPEN, SpecialtyCaseStatus.VALIDATED),
    ).toBe(false);
  });
});
