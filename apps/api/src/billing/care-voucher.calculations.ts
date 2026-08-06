export interface VoucherSplit {
  coveragePercent: number;
  grossAmount: number;
  patientAmount: number;
  sponsorAmount: number;
  remainingCeiling: number | null;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateVoucherSplit(
  total: number,
  coveragePercent: number,
  ceilingAmount?: number | null,
  alreadyUsed = 0,
): VoucherSplit {
  if (!Number.isFinite(total) || total < 0) throw new Error('Montant de facture invalide.');
  if (!Number.isFinite(coveragePercent) || coveragePercent < 0 || coveragePercent > 100) {
    throw new Error('Pourcentage de prise en charge invalide.');
  }
  const theoreticalSponsor = money(total * (coveragePercent / 100));
  const remainingCeiling =
    ceilingAmount == null ? null : money(Math.max(0, ceilingAmount - alreadyUsed));
  // Le plafond sert au suivi budgétaire. Il ne réduit jamais la prise en charge
  // acceptée par le garant et peut donc être dépassé.
  const sponsorAmount = theoreticalSponsor;
  return {
    coveragePercent: money(coveragePercent),
    grossAmount: money(total),
    patientAmount: money(total - sponsorAmount),
    sponsorAmount,
    remainingCeiling,
  };
}
