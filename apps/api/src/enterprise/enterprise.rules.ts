import { SpecialtyCaseStatus } from '@prisma/client';

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInsuranceSplit(total: number, coveragePercent: number) {
  const boundedPercent = Math.min(100, Math.max(0, coveragePercent));
  const insurerAmount = roundMoney((total * boundedPercent) / 100);
  return {
    coveragePercent: boundedPercent,
    insurerAmount,
    patientAmount: roundMoney(total - insurerAmount),
  };
}

export function calculateNetSalary(input: {
  baseSalary: number;
  allowances?: number;
  overtime?: number;
  deductions?: number;
  taxes?: number;
}) {
  return roundMoney(
    input.baseSalary +
      (input.allowances ?? 0) +
      (input.overtime ?? 0) -
      (input.deductions ?? 0) -
      (input.taxes ?? 0),
  );
}

export function journalTotals(lines: Array<{ debit: number; credit: number }>) {
  return lines.reduce(
    (total, line) => ({
      debit: roundMoney(total.debit + line.debit),
      credit: roundMoney(total.credit + line.credit),
    }),
    { debit: 0, credit: 0 },
  );
}

export function isBalancedJournal(lines: Array<{ debit: number; credit: number }>) {
  const totals = journalTotals(lines);
  return totals.debit > 0 && totals.debit === totals.credit;
}

const specialtyTransitions: Record<SpecialtyCaseStatus, SpecialtyCaseStatus[]> = {
  OPEN: [
    SpecialtyCaseStatus.SCHEDULED,
    SpecialtyCaseStatus.IN_PROGRESS,
    SpecialtyCaseStatus.CANCELLED,
  ],
  SCHEDULED: [SpecialtyCaseStatus.IN_PROGRESS, SpecialtyCaseStatus.CANCELLED],
  IN_PROGRESS: [SpecialtyCaseStatus.COMPLETED, SpecialtyCaseStatus.CANCELLED],
  COMPLETED: [SpecialtyCaseStatus.VALIDATED],
  VALIDATED: [],
  CANCELLED: [],
};

export function canTransitionSpecialtyCase(
  current: SpecialtyCaseStatus,
  next: SpecialtyCaseStatus,
) {
  return current === next || specialtyTransitions[current].includes(next);
}
