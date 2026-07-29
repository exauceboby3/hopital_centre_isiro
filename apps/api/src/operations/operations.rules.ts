import { BillableServiceType, ClinicalOrderStatus, TransfusionStatus } from '@prisma/client';

const clinicalTransitions: Record<ClinicalOrderStatus, ClinicalOrderStatus[]> = {
  REQUESTED: [
    ClinicalOrderStatus.SCHEDULED,
    ClinicalOrderStatus.IN_PROGRESS,
    ClinicalOrderStatus.CANCELLED,
  ],
  SCHEDULED: [ClinicalOrderStatus.IN_PROGRESS, ClinicalOrderStatus.CANCELLED],
  IN_PROGRESS: [ClinicalOrderStatus.COMPLETED, ClinicalOrderStatus.CANCELLED],
  COMPLETED: [ClinicalOrderStatus.VALIDATED],
  VALIDATED: [],
  CANCELLED: [],
};

const clinicalTypes: BillableServiceType[] = [
  BillableServiceType.PROCEDURE,
  BillableServiceType.RADIOLOGY,
  BillableServiceType.SURGERY,
  BillableServiceType.MATERNITY,
  BillableServiceType.PEDIATRICS,
  BillableServiceType.BLOOD_BANK,
  BillableServiceType.OTHER,
];

const transfusionTransitions: Record<TransfusionStatus, TransfusionStatus[]> = {
  PLANNED: [TransfusionStatus.IN_PROGRESS, TransfusionStatus.CANCELLED],
  IN_PROGRESS: [TransfusionStatus.COMPLETED, TransfusionStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransitionClinicalOrder(
  current: ClinicalOrderStatus,
  next: ClinicalOrderStatus,
): boolean {
  return current === next || clinicalTransitions[current].includes(next);
}

export function isConfigurableClinicalType(type: BillableServiceType): boolean {
  return clinicalTypes.includes(type);
}

export function canTransitionTransfusion(
  current: TransfusionStatus,
  next: TransfusionStatus,
): boolean {
  return current === next || transfusionTransitions[current].includes(next);
}
