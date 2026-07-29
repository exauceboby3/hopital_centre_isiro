import { BillableServiceType, ClinicalOrderStatus, TransfusionStatus } from '@prisma/client';
import {
  canTransitionClinicalOrder,
  canTransitionTransfusion,
  isConfigurableClinicalType,
} from './operations.rules';

describe('operations rules', () => {
  it('autorise le parcours demandé, démarré, complété et validé', () => {
    expect(
      canTransitionClinicalOrder(ClinicalOrderStatus.REQUESTED, ClinicalOrderStatus.IN_PROGRESS),
    ).toBe(true);
    expect(
      canTransitionClinicalOrder(ClinicalOrderStatus.IN_PROGRESS, ClinicalOrderStatus.COMPLETED),
    ).toBe(true);
    expect(
      canTransitionClinicalOrder(ClinicalOrderStatus.COMPLETED, ClinicalOrderStatus.VALIDATED),
    ).toBe(true);
  });

  it('interdit de valider un acte qui n’a pas été exécuté', () => {
    expect(
      canTransitionClinicalOrder(ClinicalOrderStatus.REQUESTED, ClinicalOrderStatus.VALIDATED),
    ).toBe(false);
  });

  it('sépare les actes configurables des parcours dédiés', () => {
    expect(isConfigurableClinicalType(BillableServiceType.RADIOLOGY)).toBe(true);
    expect(isConfigurableClinicalType(BillableServiceType.CONSULTATION)).toBe(false);
    expect(isConfigurableClinicalType(BillableServiceType.PHARMACY)).toBe(false);
  });

  it('impose la séquence de sécurité d’une transfusion', () => {
    expect(canTransitionTransfusion(TransfusionStatus.PLANNED, TransfusionStatus.IN_PROGRESS)).toBe(
      true,
    );
    expect(
      canTransitionTransfusion(TransfusionStatus.IN_PROGRESS, TransfusionStatus.COMPLETED),
    ).toBe(true);
    expect(canTransitionTransfusion(TransfusionStatus.PLANNED, TransfusionStatus.COMPLETED)).toBe(
      false,
    );
  });
});
