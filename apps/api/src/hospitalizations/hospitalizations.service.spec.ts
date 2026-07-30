import { CareAuthorizationStatus, Prisma } from '@prisma/client';
import { HospitalizationsService } from './hospitalizations.service';

type BillingPreview = {
  billedDays: number;
  total: number;
  paid: number;
  balance: number;
  settled: boolean;
  settledByWaiver: boolean;
  billingMissing: boolean;
};

type TestableHospitalizationsService = {
  billingPreview(hospitalization: unknown, at: Date): BillingPreview;
};

describe('HospitalizationsService billing guard', () => {
  const service = new HospitalizationsService(
    {} as ConstructorParameters<typeof HospitalizationsService>[0],
    {} as ConstructorParameters<typeof HospitalizationsService>[1],
  ) as unknown as TestableHospitalizationsService;

  const admittedAt = new Date('2026-07-28T08:00:00.000Z');
  const dischargeAt = new Date('2026-07-30T08:00:00.000Z');

  it('bloque la sortie lorsque le compte hospitalier est absent', () => {
    const preview = service.billingPreview({ admittedAt, careAuthorization: null }, dischargeAt);

    expect(preview).toMatchObject({
      settled: false,
      billingMissing: true,
      total: 0,
      paid: 0,
      balance: 0,
    });
  });

  it('bloque la sortie tant que la facture n’est pas totalement payée', () => {
    const preview = service.billingPreview(
      {
        admittedAt,
        careAuthorization: {
          status: CareAuthorizationStatus.CONSUMED,
          amount: new Prisma.Decimal(100),
          service: { price: new Prisma.Decimal(100) },
          invoice: {
            payments: [{ amount: new Prisma.Decimal(50) }],
          },
        },
      },
      dischargeAt,
    );

    expect(preview).toMatchObject({
      billedDays: 2,
      total: 200,
      paid: 50,
      balance: 150,
      settled: false,
      billingMissing: false,
    });
  });

  it('autorise la sortie lorsque le compte est intégralement réglé', () => {
    const preview = service.billingPreview(
      {
        admittedAt,
        careAuthorization: {
          status: CareAuthorizationStatus.CONSUMED,
          amount: new Prisma.Decimal(100),
          service: { price: new Prisma.Decimal(100) },
          invoice: {
            payments: [{ amount: new Prisma.Decimal(200) }],
          },
        },
      },
      dischargeAt,
    );

    expect(preview).toMatchObject({
      total: 200,
      paid: 200,
      balance: 0,
      settled: true,
      settledByWaiver: false,
    });
  });

  it('autorise une prise en charge explicitement exonérée', () => {
    const preview = service.billingPreview(
      {
        admittedAt,
        careAuthorization: {
          status: CareAuthorizationStatus.WAIVED,
          amount: new Prisma.Decimal(100),
          service: { price: new Prisma.Decimal(100) },
          invoice: { payments: [] },
        },
      },
      dischargeAt,
    );

    expect(preview).toMatchObject({
      total: 200,
      paid: 0,
      balance: 200,
      settled: true,
      settledByWaiver: true,
    });
  });
});
