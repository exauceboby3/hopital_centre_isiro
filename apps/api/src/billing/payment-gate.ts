import { CareAuthorizationStatus } from '@prisma/client';

export function canStartCare(status: CareAuthorizationStatus): boolean {
  return status === CareAuthorizationStatus.AUTHORIZED || status === CareAuthorizationStatus.WAIVED;
}
