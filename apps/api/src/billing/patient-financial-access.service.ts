import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  BillableServiceType,
  CareAuthorizationStatus,
  CareVoucherStatus,
  ConsultationStatus,
  CustomFieldEntity,
  CustomFieldType,
  ExamStatus,
  HospitalizationStatus,
  InvoiceStatus,
  NursingCareStatus,
  PatientJourneyStage,
  PrescriptionStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateGraceAuthorizationDto,
  DeclarePatientDeathDto,
  GraceScope,
} from './dto/patient-financial-access.dto';

export const PATIENT_FILE_SERVICE_CODE = 'PAT-FILE-MONTHLY';
const GRACE_ISSUER = 'MESURE DE GRÂCE INTERNE';
const MAX_GRACE_DURATION_MS = 72 * 60 * 60 * 1000;
const FILE_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

type DatabaseClient = Prisma.TransactionClient | PrismaService;

interface GraceMetadata {
  kind: 'INTERNAL_GRACE';
  scope: GraceScope;
  reason: string;
  createdById: string;
}

@Injectable()
export class PatientFinancialAccessService {
  constructor(private readonly prisma: PrismaService) {}

  presentFileAuthorization<T extends { id: string; status: CareAuthorizationStatus }>(
    authorization: T,
    user: AuthenticatedUser,
  ) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])) {
      return authorization;
    }
    const clearedStatuses: CareAuthorizationStatus[] = [
      CareAuthorizationStatus.AUTHORIZED,
      CareAuthorizationStatus.WAIVED,
      CareAuthorizationStatus.CONSUMED,
    ];
    const inOrder = clearedStatuses.includes(authorization.status);
    return {
      id: authorization.id,
      status: authorization.status,
      paymentClearance: { inOrder, status: inOrder ? 'IN_ORDER' : 'TO_REGULARIZE' },
    };
  }

  async createInitialFileAuthorization(
    patientId: string,
    createdById: string,
    db: DatabaseClient = this.prisma,
  ) {
    return this.createFileAuthorization(patientId, createdById, db, true);
  }

  async renewFile(patientId: string, createdById: string) {
    return this.prisma.$transaction((transaction) =>
      this.createFileAuthorization(patientId, createdById, transaction, false),
    );
  }

  async summary(patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: {
        id: true,
        medicalRecordNumber: true,
        lastName: true,
        postName: true,
        firstName: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const [file, grace, outstandingBalance, death] = await Promise.all([
      this.fileStatus(patientId, this.prisma),
      this.activeGrace(patientId, BillableServiceType.OTHER, this.prisma, true),
      this.outstandingBalance(patientId, undefined, this.prisma),
      this.deathStatus(patientId, this.prisma),
    ]);

    const financialHold = !death.deceased && !grace && (!file.active || outstandingBalance > 0);
    return {
      patient,
      file,
      grace,
      outstandingBalance,
      financialHold,
      death,
      policy: {
        monthlyFilePriceCdf: 5000,
        monthlyValidityDaysLabel: '1 mois',
        maximumGraceHours: 72,
      },
    };
  }

  async grantGrace(patientId: string, dto: CreateGraceAuthorizationDto, createdById: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    if ((await this.deathStatus(patientId, this.prisma)).deceased) {
      throw new BadRequestException(
        'Une mesure de grâce ne peut pas être ouverte pour un patient décédé.',
      );
    }

    const now = new Date();
    const expiresAt = new Date(dto.expiresAt);
    const duration = expiresAt.getTime() - now.getTime();
    if (duration <= 0 || duration > MAX_GRACE_DURATION_MS) {
      throw new BadRequestException(
        'La mesure de grâce doit expirer dans le futur et ne peut pas dépasser 72 heures.',
      );
    }

    const metadata: GraceMetadata = {
      kind: 'INTERNAL_GRACE',
      scope: dto.scope,
      reason: dto.reason.trim(),
      createdById,
    };
    return this.prisma.$transaction(async (transaction) => {
      await this.expireInternalGrace(patientId, now, transaction);
      await transaction.careVoucher.updateMany({
        where: {
          patientId,
          issuerName: GRACE_ISSUER,
          status: CareVoucherStatus.ACTIVE,
        },
        data: { status: CareVoucherStatus.CANCELLED },
      });
      const grace = await transaction.careVoucher.create({
        data: {
          number: `GRACE-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          patientId,
          createdById,
          issuerName: GRACE_ISSUER,
          coveragePercent: new Prisma.Decimal(100),
          validFrom: now,
          validUntil: expiresAt,
          status: CareVoucherStatus.ACTIVE,
          notes: JSON.stringify(metadata),
        },
        include: { patient: true, createdBy: { select: { id: true, username: true } } },
      });
      await transaction.auditLog.create({
        data: {
          userId: createdById,
          action: 'PATIENT_GRACE_GRANTED',
          entity: 'CareVoucher',
          entityId: grace.id,
          metadata: {
            patientId,
            scope: dto.scope,
            validUntil: expiresAt.toISOString(),
            reason: dto.reason.trim(),
          },
        },
      });
      return grace;
    });
  }

  async revokeGrace(id: string, userId: string) {
    const voucher = await this.prisma.careVoucher.findUnique({ where: { id } });
    if (!voucher || voucher.issuerName !== GRACE_ISSUER) {
      throw new NotFoundException('Mesure de grâce introuvable.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.careVoucher.update({
        where: { id },
        data: {
          status: CareVoucherStatus.CANCELLED,
          notes: this.appendNote(
            voucher.notes,
            `Révoquée par ${userId} le ${new Date().toISOString()}`,
          ),
        },
      });
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PATIENT_GRACE_REVOKED',
          entity: 'CareVoucher',
          entityId: id,
          metadata: { patientId: voucher.patientId },
        },
      });
      return updated;
    });
  }

  async declareDeath(patientId: string, dto: DeclarePatientDeathDto, userId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true, medicalRecordNumber: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    const occurredAt = new Date(dto.occurredAt);
    if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) {
      throw new BadRequestException('La date du décès ne peut pas être située dans le futur.');
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.writePatientMarker(
        transaction,
        patientId,
        'patient_status',
        'Statut du patient',
        'DECEASED',
        userId,
      );
      await this.writePatientMarker(
        transaction,
        patientId,
        'deceased_at',
        'Date et heure du décès',
        occurredAt.toISOString(),
        userId,
        CustomFieldType.DATE,
      );
      await this.writePatientMarker(
        transaction,
        patientId,
        'death_reason',
        'Cause / contexte du décès',
        dto.reason.trim(),
        userId,
      );
      if (dto.notes?.trim()) {
        await this.writePatientMarker(
          transaction,
          patientId,
          'death_notes',
          'Observations liées au décès',
          dto.notes.trim(),
          userId,
          CustomFieldType.TEXTAREA,
        );
      }

      await Promise.all([
        transaction.appointment.updateMany({
          where: {
            patientId,
            status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
          },
          data: {
            status: AppointmentStatus.CANCELLED,
            journeyStage: PatientJourneyStage.CANCELLED,
            journeyUpdatedAt: occurredAt,
            notes: 'Parcours clôturé à la suite du décès déclaré du patient.',
          },
        }),
        transaction.consultation.updateMany({
          where: {
            patientId,
            status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
          },
          data: {
            status: ConsultationStatus.CANCELLED,
            completedAt: occurredAt,
            orientation: 'Épisode clôturé à la suite du décès déclaré du patient.',
          },
        }),
        transaction.examRequest.updateMany({
          where: {
            patientId,
            status: { in: [ExamStatus.REQUESTED, ExamStatus.IN_PROGRESS, ExamStatus.COMPLETED] },
          },
          data: {
            status: ExamStatus.CANCELLED,
            reviewComment: 'Annulé après déclaration du décès.',
          },
        }),
        transaction.nursingCare.updateMany({
          where: {
            patientId,
            status: {
              in: [
                NursingCareStatus.ORDERED,
                NursingCareStatus.SCHEDULED,
                NursingCareStatus.IN_PROGRESS,
              ],
            },
          },
          data: {
            status: NursingCareStatus.CANCELLED,
            observations: 'Soin annulé après déclaration du décès.',
          },
        }),
        transaction.prescription.updateMany({
          where: {
            patientId,
            status: {
              in: [
                PrescriptionStatus.DRAFT,
                PrescriptionStatus.ACTIVE,
                PrescriptionStatus.PARTIALLY_DISPENSED,
              ],
            },
          },
          data: { status: PrescriptionStatus.CANCELLED },
        }),
        transaction.careVoucher.updateMany({
          where: { patientId, issuerName: GRACE_ISSUER, status: CareVoucherStatus.ACTIVE },
          data: { status: CareVoucherStatus.CANCELLED },
        }),
      ]);

      const activeHospitalizations = await transaction.hospitalization.findMany({
        where: { patientId, status: HospitalizationStatus.ACTIVE },
        select: { id: true, bedId: true, notes: true },
      });
      for (const stay of activeHospitalizations) {
        await transaction.hospitalization.update({
          where: { id: stay.id },
          data: {
            status: HospitalizationStatus.DISCHARGED,
            dischargedAt: occurredAt,
            notes: this.appendNote(stay.notes, `Décès déclaré : ${dto.reason.trim()}`),
          },
        });
        await transaction.bed.update({ where: { id: stay.bedId }, data: { status: 'AVAILABLE' } });
      }

      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PATIENT_DEATH_DECLARED',
          entity: 'Patient',
          entityId: patientId,
          metadata: {
            occurredAt: occurredAt.toISOString(),
            reason: dto.reason.trim(),
            notes: dto.notes?.trim() || null,
          },
        },
      });

      return {
        success: true,
        patientId,
        medicalRecordNumber: patient.medicalRecordNumber,
        occurredAt,
      };
    });
  }

  async assertCareAccess(
    patientId: string,
    expectedType: BillableServiceType,
    excludeInvoiceId?: string,
    db: DatabaseClient = this.prisma,
  ) {
    const death = await this.deathStatus(patientId, db);
    if (death.deceased) {
      throw new ForbiddenException(
        'Ce dossier est clôturé pour décès. Aucun nouvel acte médical ou pharmaceutique ne peut être ouvert.',
      );
    }

    const grace = await this.activeGrace(patientId, expectedType, db);
    if (grace) return { grace, fileActive: false, outstandingBalance: 0 };

    const file = await this.fileStatus(patientId, db);
    if (!file.active) {
      throw new ForbiddenException(
        'La fiche mensuelle du patient est expirée ou impayée. Renouvelez la fiche de 5 000 CDF ou accordez une mesure de grâce.',
      );
    }

    const outstandingBalance = await this.outstandingBalance(patientId, excludeInvoiceId, db);
    if (outstandingBalance > 0) {
      throw new ForbiddenException(
        `Compte patient bloqué : un solde de ${outstandingBalance.toLocaleString('fr-FR')} CDF reste à régulariser. Un administrateur peut accorder une mesure de grâce de 72 heures maximum.`,
      );
    }
    return { grace: null, fileActive: true, outstandingBalance };
  }

  async activeGrace(
    patientId: string,
    expectedType: BillableServiceType,
    db: DatabaseClient = this.prisma,
    ignoreScope = false,
  ) {
    const now = new Date();
    await this.expireInternalGrace(patientId, now, db);
    const vouchers = await db.careVoucher.findMany({
      where: {
        patientId,
        issuerName: GRACE_ISSUER,
        status: CareVoucherStatus.ACTIVE,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    for (const voucher of vouchers) {
      const metadata = this.parseGrace(voucher.notes);
      if (!metadata) continue;
      if (ignoreScope || this.scopeCovers(metadata.scope, expectedType)) {
        return {
          id: voucher.id,
          number: voucher.number,
          scope: metadata.scope,
          reason: metadata.reason,
          createdById: metadata.createdById,
          validFrom: voucher.validFrom,
          validUntil: voucher.validUntil,
        };
      }
    }
    return null;
  }

  private async createFileAuthorization(
    patientId: string,
    createdById: string,
    db: DatabaseClient,
    initial: boolean,
  ) {
    const patient = await db.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    if ((await this.deathStatus(patientId, db)).deceased) {
      throw new BadRequestException('La fiche d’un patient décédé ne peut pas être renouvelée.');
    }

    const service = await db.billableService.findUnique({
      where: { code: PATIENT_FILE_SERVICE_CODE },
    });
    if (!service || !service.isActive) {
      throw new NotFoundException('Le tarif de fiche patient mensuelle est absent ou inactif.');
    }

    const file = await this.fileStatus(patientId, db);
    if (file.pending) return file.pending;
    if (!initial && file.active && file.validUntil) {
      const remaining = new Date(file.validUntil).getTime() - Date.now();
      if (remaining > FILE_RENEWAL_WINDOW_MS) {
        throw new BadRequestException(
          `La fiche est encore valide jusqu’au ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(file.validUntil))}. Le renouvellement est disponible dans les dernières 24 heures.`,
        );
      }
    }

    const requiresPayment = service.price.greaterThan(0);
    const invoice = await db.invoice.create({
      data: {
        number: this.invoiceNumber(),
        patientId,
        issuedById: createdById,
        status: requiresPayment ? InvoiceStatus.PENDING : InvoiceStatus.PAID,
        total: service.price,
        notes: 'Fiche patient mensuelle — validité d’un mois après paiement ou garantie.',
        dueAt: new Date(),
        items: {
          create: {
            description: service.name,
            quantity: 1,
            unitPrice: service.price,
            total: service.price,
          },
        },
      },
    });
    return db.careAuthorization.create({
      data: {
        patientId,
        invoiceId: invoice.id,
        serviceId: service.id,
        createdById,
        type: BillableServiceType.OTHER,
        description: service.name,
        amount: service.price,
        status: requiresPayment
          ? CareAuthorizationStatus.PENDING
          : CareAuthorizationStatus.AUTHORIZED,
        authorizedAt: requiresPayment ? undefined : new Date(),
      },
      include: { invoice: true, service: true },
    });
  }

  private async fileStatus(patientId: string, db: DatabaseClient) {
    const rows = await db.careAuthorization.findMany({
      where: { patientId, service: { code: PATIENT_FILE_SERVICE_CODE } },
      include: { invoice: true, service: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const now = Date.now();
    const activeRow = rows.find((row) => {
      const activatedAt = row.authorizedAt ?? row.waivedAt;
      const activeStatus =
        row.status === CareAuthorizationStatus.AUTHORIZED ||
        row.status === CareAuthorizationStatus.WAIVED;
      if (!activatedAt || !activeStatus) return false;
      return this.addOneMonth(activatedAt).getTime() > now;
    });
    const pending = rows.find((row) => row.status === CareAuthorizationStatus.PENDING);
    const activatedAt = activeRow?.authorizedAt ?? activeRow?.waivedAt ?? null;
    return {
      active: Boolean(activeRow),
      authorizationId: activeRow?.id ?? null,
      invoiceId: activeRow?.invoiceId ?? pending?.invoiceId ?? null,
      invoiceNumber: activeRow?.invoice.number ?? pending?.invoice.number ?? null,
      invoiceStatus: activeRow?.invoice.status ?? pending?.invoice.status ?? null,
      validFrom: activatedAt,
      validUntil: activatedAt ? this.addOneMonth(activatedAt) : null,
      pending: pending
        ? {
            id: pending.id,
            invoiceId: pending.invoiceId,
            invoiceNumber: pending.invoice.number,
            amount: Number(pending.amount),
            status: pending.status,
          }
        : null,
    };
  }

  private async outstandingBalance(
    patientId: string,
    excludeInvoiceId: string | undefined,
    db: DatabaseClient,
  ) {
    const invoices = await db.invoice.findMany({
      where: {
        patientId,
        status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID] },
        ...(excludeInvoiceId ? { id: { not: excludeInvoiceId } } : {}),
        NOT: { careAuthorization: { service: { code: PATIENT_FILE_SERVICE_CODE } } },
      },
      include: {
        payments: true,
        insuranceCoverage: true,
        voucherCoverage: true,
      },
      take: 250,
    });
    return invoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce(
        (paymentSum, payment) => paymentSum + Number(payment.amount),
        0,
      );
      const insured =
        invoice.insuranceCoverage &&
        ['GUARANTEED', 'SETTLED'].includes(invoice.insuranceCoverage.status)
          ? Number(invoice.insuranceCoverage.insurerAmount)
          : 0;
      const sponsored =
        invoice.voucherCoverage &&
        ['GUARANTEED', 'SETTLED'].includes(invoice.voucherCoverage.status)
          ? Number(invoice.voucherCoverage.sponsorAmount)
          : 0;
      return sum + Math.max(0, Number(invoice.total) - paid - insured - sponsored);
    }, 0);
  }

  private async deathStatus(patientId: string, db: DatabaseClient) {
    const marker = await db.customFieldValue.findFirst({
      where: {
        entityId: patientId,
        definition: { entity: CustomFieldEntity.PATIENT, key: 'patient_status' },
      },
      include: { definition: true },
    });
    const deceased = String(marker?.value ?? '').replaceAll('"', '') === 'DECEASED';
    if (!deceased) return { deceased: false, occurredAt: null, reason: null, notes: null };
    const values = await db.customFieldValue.findMany({
      where: {
        entityId: patientId,
        definition: {
          entity: CustomFieldEntity.PATIENT,
          key: { in: ['deceased_at', 'death_reason', 'death_notes'] },
        },
      },
      include: { definition: true },
    });
    const byKey = new Map(
      values.map((value) => [value.definition.key, String(value.value).replaceAll('"', '')]),
    );
    return {
      deceased: true,
      occurredAt: byKey.get('deceased_at') ?? null,
      reason: byKey.get('death_reason') ?? null,
      notes: byKey.get('death_notes') ?? null,
    };
  }

  private async writePatientMarker(
    db: Prisma.TransactionClient,
    patientId: string,
    key: string,
    label: string,
    value: string,
    createdById: string,
    type: CustomFieldType = CustomFieldType.TEXT,
  ) {
    const definition = await db.customFieldDefinition.upsert({
      where: { entity_key: { entity: CustomFieldEntity.PATIENT, key } },
      update: { label, type, isActive: true },
      create: {
        entity: CustomFieldEntity.PATIENT,
        key,
        label,
        type,
        isActive: true,
        displayOrder: 900,
        createdById,
      },
    });
    await db.customFieldValue.upsert({
      where: { definitionId_entityId: { definitionId: definition.id, entityId: patientId } },
      update: { value },
      create: { definitionId: definition.id, entityId: patientId, value },
    });
  }

  private async expireInternalGrace(
    patientId: string,
    now: Date,
    db: DatabaseClient = this.prisma,
  ) {
    await db.careVoucher.updateMany({
      where: {
        patientId,
        issuerName: GRACE_ISSUER,
        status: CareVoucherStatus.ACTIVE,
        validUntil: { lte: now },
      },
      data: { status: CareVoucherStatus.EXPIRED },
    });
  }

  private parseGrace(notes?: string | null): GraceMetadata | null {
    if (!notes) return null;
    try {
      const value = JSON.parse(notes) as Partial<GraceMetadata>;
      if (value.kind === 'INTERNAL_GRACE' && value.scope && value.reason && value.createdById) {
        return value as GraceMetadata;
      }
    } catch {
      return null;
    }
    return null;
  }

  private scopeCovers(scope: GraceScope, type: BillableServiceType) {
    if (scope === 'ALL_CARE') return true;
    if (scope === 'PHARMACY') return type === BillableServiceType.PHARMACY;
    return type !== BillableServiceType.PHARMACY;
  }

  private addOneMonth(date: Date) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1);
    return result;
  }

  private invoiceNumber() {
    return `FAC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private appendNote(current: string | null | undefined, addition: string) {
    return [current?.trim(), addition.trim()].filter(Boolean).join(' — ');
  }
}
