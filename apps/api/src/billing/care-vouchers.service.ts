import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CareAuthorizationStatus,
  CareVoucherStatus,
  PaymentPayer,
  Prisma,
  VoucherCoverageStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { calculateVoucherSplit } from './care-voucher.calculations';
import {
  AllocateCareVoucherDto,
  CreateCareVoucherDto,
  UpdateCareVoucherStatusDto,
} from './dto/care-voucher.dto';

const INTERNAL_GRACE_ISSUER = 'MESURE DE GRÂCE INTERNE';

export function generateCareVoucherNumber(now = new Date(), entropy = randomUUID()) {
  const suffix = entropy.replaceAll('-', '').slice(0, 10).toUpperCase();
  return `BON-${now.getUTCFullYear()}-${suffix}`;
}

const voucherInclude = {
  patient: true,
  createdBy: { select: { id: true, username: true } },
  coverages: {
    include: { invoice: { include: { patient: true, items: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.CareVoucherInclude;

const coverageInclude = {
  invoice: { include: { patient: true, payments: true } },
  careVoucher: { include: { patient: true } },
  createdBy: { select: { id: true, username: true } },
} satisfies Prisma.VoucherCoverageInclude;

@Injectable()
export class CareVouchersService {
  constructor(private readonly prisma: PrismaService) {}

  list(patientId?: string, status?: CareVoucherStatus) {
    return this.prisma.careVoucher.findMany({
      where: {
        issuerName: { not: INTERNAL_GRACE_ISSUER },
        ...(patientId ? { patientId } : {}),
        ...(status ? { status } : {}),
      },
      include: voucherInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async findOne(id: string) {
    const voucher = await this.prisma.careVoucher.findUnique({
      where: { id },
      include: voucherInclude,
    });
    if (!voucher || voucher.issuerName === INTERNAL_GRACE_ISSUER) {
      throw new NotFoundException('Bon de soins introuvable.');
    }
    return voucher;
  }

  coverages(invoiceId?: string) {
    return this.prisma.voucherCoverage.findMany({
      where: invoiceId ? { invoiceId } : undefined,
      include: coverageInclude,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }

  async create(dto: CreateCareVoucherDto, userId: string) {
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : undefined;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : undefined;
    if (validFrom && validUntil && validUntil < validFrom) {
      throw new BadRequestException('La fin de validité du bon précède son début.');
    }
    if (dto.issuerName.trim().toUpperCase() === INTERNAL_GRACE_ISSUER) {
      throw new BadRequestException(
        'Utilisez le module Fiche & grâce pour créer une mesure de grâce interne.',
      );
    }
    if (dto.patientId) {
      const patient = await this.prisma.patient.findFirst({
        where: { id: dto.patientId, archivedAt: null },
        select: { id: true },
      });
      if (!patient) throw new NotFoundException('Patient actif introuvable.');
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.careVoucher.create({
          data: {
            patientId: dto.patientId,
            sponsorType: dto.sponsorType,
            createdById: userId,
            number: generateCareVoucherNumber(),
            issuerName: dto.issuerName.trim(),
            coveragePercent: new Prisma.Decimal(dto.coveragePercent),
            ceilingAmount:
              dto.ceilingAmount == null ? undefined : new Prisma.Decimal(dto.ceilingAmount),
            validFrom,
            validUntil,
            notes: dto.notes?.trim(),
          },
          include: voucherInclude,
        });
      } catch (error) {
        const duplicateNumber =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (duplicateNumber && attempt < 2) continue;
        if (duplicateNumber) {
          throw new ConflictException(
            'Impossible de générer un numéro de bon unique. Veuillez réessayer.',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('Impossible de générer un numéro de bon unique.');
  }

  async updateStatus(id: string, dto: UpdateCareVoucherStatusDto) {
    const voucher = await this.prisma.careVoucher.findUnique({
      where: { id },
      select: { id: true, issuerName: true },
    });
    if (!voucher || voucher.issuerName === INTERNAL_GRACE_ISSUER) {
      throw new NotFoundException('Bon de soins introuvable.');
    }
    return this.prisma.careVoucher.update({
      where: { id },
      data: { status: dto.status },
      include: voucherInclude,
    });
  }

  async allocate(dto: AllocateCareVoucherDto, userId: string) {
    return this.prisma.$transaction(
      async (transaction) => {
        const [invoice, voucher] = await Promise.all([
          transaction.invoice.findUnique({
            where: { id: dto.invoiceId },
            include: {
              payments: true,
              insuranceCoverage: true,
              voucherCoverage: true,
            },
          }),
          transaction.careVoucher.findUnique({ where: { id: dto.careVoucherId } }),
        ]);
        if (!invoice || !voucher || voucher.issuerName === INTERNAL_GRACE_ISSUER) {
          throw new NotFoundException('Facture ou bon de soins introuvable.');
        }
        if (invoice.status === 'PAID' || invoice.status === 'CANCELLED') {
          throw new BadRequestException("Cette facture n'accepte plus de prise en charge.");
        }
        if (invoice.payments.length > 0) {
          throw new BadRequestException(
            'Le bon de soins doit être appliqué avant le premier encaissement de la facture.',
          );
        }
        if (invoice.insuranceCoverage || invoice.voucherCoverage) {
          throw new BadRequestException('Cette facture possède déjà une prise en charge.');
        }
        if (voucher.patientId && invoice.patientId !== voucher.patientId) {
          throw new BadRequestException('Le bon de soins ne correspond pas au patient facturé.');
        }
        const now = new Date();
        if (
          voucher.status !== CareVoucherStatus.ACTIVE ||
          (voucher.validFrom && voucher.validFrom > now) ||
          (voucher.validUntil && voucher.validUntil < now)
        ) {
          throw new BadRequestException("Ce bon de soins n'est pas actif à cette date.");
        }
        const split = calculateVoucherSplit(
          Number(invoice.total),
          Number(voucher.coveragePercent),
          voucher.ceilingAmount == null ? null : Number(voucher.ceilingAmount),
          Number(voucher.usedAmount),
        );
        const coverage = await transaction.voucherCoverage.create({
          data: {
            invoiceId: invoice.id,
            careVoucherId: voucher.id,
            createdById: userId,
            coveragePercent: new Prisma.Decimal(split.coveragePercent),
            grossAmount: new Prisma.Decimal(split.grossAmount),
            patientAmount: new Prisma.Decimal(split.patientAmount),
            sponsorAmount: new Prisma.Decimal(split.sponsorAmount),
            reference: dto.reference?.trim(),
            notes: dto.notes?.trim(),
          },
        });
        const nextUsed = Number(voucher.usedAmount) + split.sponsorAmount;
        await transaction.careVoucher.update({
          where: { id: voucher.id },
          data: {
            usedAmount: new Prisma.Decimal(nextUsed),
            // Le plafond est informatif : un garant continue à prendre en charge
            // les factures même lorsque le cumul le dépasse.
          },
        });
        const patientPaid = invoice.payments
          .filter((payment) => payment.payerType === PaymentPayer.PATIENT)
          .reduce((sum, payment) => sum + Number(payment.amount), 0);
        if (patientPaid >= split.patientAmount) {
          await transaction.careAuthorization.updateMany({
            where: { invoiceId: invoice.id, status: CareAuthorizationStatus.PENDING },
            data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: now },
          });
        }
        return transaction.voucherCoverage.findUniqueOrThrow({
          where: { id: coverage.id },
          include: coverageInclude,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancelCoverage(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const coverage = await transaction.voucherCoverage.findUnique({
        where: { id },
        include: { invoice: { include: { payments: true, careAuthorization: true } } },
      });
      if (!coverage) throw new NotFoundException('Prise en charge par bon introuvable.');
      if (coverage.status !== VoucherCoverageStatus.GUARANTEED) {
        throw new BadRequestException('Cette prise en charge ne peut plus être annulée.');
      }
      if (
        coverage.invoice.payments.length > 0 ||
        coverage.invoice.careAuthorization?.status === CareAuthorizationStatus.AUTHORIZED
      ) {
        throw new BadRequestException(
          'La prise en charge ne peut plus être annulée après paiement ou autorisation des soins.',
        );
      }
      await transaction.careVoucher.update({
        where: { id: coverage.careVoucherId },
        data: {
          usedAmount: { decrement: coverage.sponsorAmount },
          status: CareVoucherStatus.ACTIVE,
        },
      });
      return transaction.voucherCoverage.update({
        where: { id },
        data: { status: VoucherCoverageStatus.CANCELLED },
        include: coverageInclude,
      });
    });
  }
}
