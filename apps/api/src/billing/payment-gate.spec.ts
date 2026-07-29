import { CareAuthorizationStatus } from '@prisma/client';
import { canStartCare } from './payment-gate';

describe('canStartCare', () => {
  it.each([CareAuthorizationStatus.AUTHORIZED, CareAuthorizationStatus.WAIVED])(
    'autorise les soins avec le statut %s',
    (status) => expect(canStartCare(status)).toBe(true),
  );

  it.each([
    CareAuthorizationStatus.PENDING,
    CareAuthorizationStatus.CONSUMED,
    CareAuthorizationStatus.CANCELLED,
  ])('bloque les soins avec le statut %s', (status) => {
    expect(canStartCare(status)).toBe(false);
  });
});
