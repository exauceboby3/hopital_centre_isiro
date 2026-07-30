import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BedStatus,
  BillableServiceType,
  CareAuthorizationStatus,
  ConsultationStatus,
  HospitalizationStatus,
  InvoiceStatus,
  NursingCareStatus,
  PatientJourneyStage,
  Prisma,
  Role,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { AdmitPatientDto } from './dto/admit-patient.dto';
import { CreateRoomDto } from './dto/create-room.dto';

const hospitalizationInclude = {
  patient: true,
  doctor: { include: { user: { select: { id: true, username: true } } } },
  bed: { include: { room: true } },
  careAuthorization: {
    include: {
      service: true,
      invoice: { include: { items: true, payments: true } },
    },
  },
} satisfies Prisma.HospitalizationInclude;

type HospitalizationRow = Prisma.HospitalizationGetPayload<{
  include: typeof hospitalizationInclude;
}>;

const MEDICAL_DISCHARGE_ACTION = 'HOSPITALIZATION_MEDICAL_DISCHARGE_APPROVED';
const ADMINISTRATIVE_DISCHARGE_ACTION = 'HOSPITALIZATION_ADMINISTRATIVE_DISCHARGE';

@Injectable()
export class HospitalizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  async list(status?: HospitalizationStatus) {
    const rows = await this.prisma.hospitalization.findMany({
      where: status ? { status } : undefined,
      include: hospitalizationInclude,
      orderBy: { admittedAt: 'desc' },
      take: 250,
    });
    const approvals = rows.length
      ? await this.prisma.auditLog.findMany({
          where: {
            entity: 'Hospitalization',
            entityId: { in: rows.map((row) => row.id) },
            action: MEDICAL_DISCHARGE_ACTION,
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const approvalByHospitalization = new Map<string, (typeof approvals)[number]>();
    for (const approval of approvals) {
      if (approval.entityId && !approvalByHospitalization.has(approval.entityId)) {
        approvalByHospitalization.set(approval.entityId, approval);
      }
    }
    return rows.map((row) => this.present(row, approvalByHospitalization.get(row.id)?.createdAt));
  }

  rooms() {
    return this.prisma.room.findMany({
      include: {
        beds: {
          orderBy: { code: 'asc' },
          include: {
            hospitalizations: {
              where: { status: HospitalizationStatus.ACTIVE },
              include: { patient: true },
              take: 1,
            },
          },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  createRoom(dto: CreateRoomDto) {
    return this.prisma.room.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        service: dto.service,
        beds: {
          create: dto.bedCodes.map((code) => ({ code: code.trim().toUpperCase() })),
        },
      },
      include: { beds: true },
    });
  }

  async admit(dto: AdmitPatientDto, user: AuthenticatedUser) {
    let doctorId = dto.doctorId;
    if (hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])) {
      doctorId = (await this.prisma.doctorProfile.findUnique({ where: { userId: user.id } }))?.id;
    }

    return this.prisma.$transaction(async (transaction) => {
      await this.authorizations.assertAuthorized(
        dto.authorizationId,
        dto.patientId,
        BillableServiceType.HOSPITALIZATION,
        transaction,
      );

      const referralConsultation = await transaction.consultation.findFirst({
        where: {
          patientId: dto.patientId,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
          appointment: { journeyStage: PatientJourneyStage.HOSPITALIZATION },
        },
        select: {
          id: true,
          doctorId: true,
          appointmentId: true,
          doctor: { select: { userId: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      doctorId ??= referralConsultation?.doctorId;

      const claimed = await transaction.bed.updateMany({
        where: { id: dto.bedId, status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED },
      });
      if (!claimed.count) throw new ConflictException("Ce lit n'est plus disponible.");

      const hospitalization = await transaction.hospitalization.create({
        data: {
          patientId: dto.patientId,
          bedId: dto.bedId,
          doctorId,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim(),
          expectedDischargeAt: dto.expectedDischargeAt
            ? new Date(dto.expectedDischargeAt)
            : undefined,
        },
      });
      await this.authorizations.consume(
        dto.authorizationId,
        dto.patientId,
        BillableServiceType.HOSPITALIZATION,
        { hospitalizationId: hospitalization.id },
        transaction,
      );

      await transaction.nursingCare.updateMany({
        where: {
          patientId: dto.patientId,
          ...(referralConsultation?.id ? { consultationId: referralConsultation.id } : {}),
          hospitalizationId: null,
          label: "Préparer l'admission en hospitalisation",
          status: {
            in: [
              NursingCareStatus.ORDERED,
              NursingCareStatus.SCHEDULED,
              NursingCareStatus.IN_PROGRESS,
            ],
          },
        },
        data: { hospitalizationId: hospitalization.id },
      });

      const patient = await transaction.patient.findUniqueOrThrow({
        where: { id: dto.patientId },
        select: { medicalRecordNumber: true, lastName: true, postName: true, firstName: true },
      });
      const bed = await transaction.bed.findUniqueOrThrow({
        where: { id: dto.bedId },
        include: { room: true },
      });
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'HOSPITALIZATION_ADMITTED',
          entity: 'Hospitalization',
          entityId: hospitalization.id,
          metadata: {
            patientId: dto.patientId,
            medicalRecordNumber: patient.medicalRecordNumber,
            room: bed.room.code,
            bed: bed.code,
            consultationId: referralConsultation?.id ?? null,
          },
        },
      });

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: hospitalization.id },
        include: hospitalizationInclude,
      });
    });
  }

  async medicalDischarge(id: string, userId: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({
      where: { id },
      include: hospitalizationInclude,
    });
    if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
    if (hospitalization.status !== HospitalizationStatus.ACTIVE) {
      throw new ConflictException('Cette hospitalisation est déjà clôturée.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const billing = await this.finalizeInvoice(hospitalization, new Date(), transaction);
      const existingApproval = await transaction.auditLog.findFirst({
        where: {
          action: MEDICAL_DISCHARGE_ACTION,
          entity: 'Hospitalization',
          entityId: id,
        },
        orderBy: { createdAt: 'desc' },
      });
      const approval =
        existingApproval ??
        (await transaction.auditLog.create({
          data: {
            userId,
            action: MEDICAL_DISCHARGE_ACTION,
            entity: 'Hospitalization',
            entityId: id,
            metadata: {
              billedDays: billing.billedDays,
              total: billing.total,
              paid: billing.paid,
              balance: billing.balance,
              administrativeDischargeAllowed: billing.settled,
            },
          },
        }));
      const row = await transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
      return this.present(row, approval.createdAt);
    });
  }

  async administrativeDischarge(id: string, userId: string) {
    const hospitalization = await this.prisma.hospitalization.findUnique({
      where: { id },
      include: hospitalizationInclude,
    });
    if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
    if (hospitalization.status !== HospitalizationStatus.ACTIVE) {
      throw new ConflictException('Cette hospitalisation est déjà clôturée.');
    }

    const approval = await this.prisma.auditLog.findFirst({
      where: {
        action: MEDICAL_DISCHARGE_ACTION,
        entity: 'Hospitalization',
        entityId: id,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) {
      throw new ConflictException(
        'La sortie médicale doit être validée par le médecin avant la sortie administrative.',
      );
    }

    const preview = this.billingPreview(hospitalization, new Date());
    if (!preview.settled) {
      throw new ConflictException(
        `Sortie administrative bloquée : le solde du séjour est de ${preview.balance.toFixed(2)}. Finalisez le paiement ou la prise en charge avant de libérer le patient.`,
      );
    }

    return this.prisma.$transaction(async (transaction) => {
      const dischargedAt = new Date();
      const billing = await this.finalizeInvoice(hospitalization, dischargedAt, transaction);
      if (!billing.settled) {
        throw new ConflictException(
          `Sortie administrative bloquée : le solde du séjour est de ${billing.balance.toFixed(2)}.`,
        );
      }

      const updated = await transaction.hospitalization.update({
        where: { id },
        data: { status: HospitalizationStatus.DISCHARGED, dischargedAt },
      });
      // Le trigger de gouvernance place automatiquement le lit en maintenance et crée
      // une demande de nettoyage. Le lit ne redevient disponible qu'après validation.

      await transaction.nursingCare.updateMany({
        where: {
          hospitalizationId: id,
          status: { in: [NursingCareStatus.ORDERED, NursingCareStatus.SCHEDULED] },
        },
        data: { status: NursingCareStatus.CANCELLED },
      });

      await transaction.auditLog.create({
        data: {
          userId,
          action: ADMINISTRATIVE_DISCHARGE_ACTION,
          entity: 'Hospitalization',
          entityId: id,
          metadata: {
            medicalApprovalAt: approval.createdAt,
            billedDays: billing.billedDays,
            total: billing.total,
            paid: billing.paid,
            balance: billing.balance,
            settledByWaiver: billing.settledByWaiver,
          },
        },
      });

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id: updated.id },
        include: hospitalizationInclude,
      });
    });
  }

  async transfer(id: string, bedId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const hospitalization = await transaction.hospitalization.findUnique({ where: { id } });
      if (!hospitalization) throw new NotFoundException('Hospitalisation introuvable.');
      if (hospitalization.status !== HospitalizationStatus.ACTIVE) {
        throw new ConflictException('Seule une hospitalisation active peut être déplacée.');
      }
      if (hospitalization.bedId === bedId) {
        throw new ConflictException('Le patient occupe déjà ce lit.');
      }
      const claimed = await transaction.bed.updateMany({
        where: { id: bedId, status: BedStatus.AVAILABLE },
        data: { status: BedStatus.OCCUPIED },
      });
      if (!claimed.count) throw new ConflictException("Le nouveau lit n'est plus disponible.");

      const moved = await transaction.hospitalization.updateMany({
        where: { id, status: HospitalizationStatus.ACTIVE, bedId: hospitalization.bedId },
        data: { bedId },
      });
      if (!moved.count) throw new ConflictException("L'hospitalisation vient d'être modifiée.");

      await transaction.bed.update({
        where: { id: hospitalization.bedId },
        data: { status: BedStatus.MAINTENANCE },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "BedTurnover" ("id", "bedId", "hospitalizationId", "status", "requestedAt")
        VALUES (${randomUUID()}, ${hospitalization.bedId}, ${id}, 'PENDING_CLEANING', CURRENT_TIMESTAMP)
      `);

      return transaction.hospitalization.findUniqueOrThrow({
        where: { id },
        include: hospitalizationInclude,
      });
    });
  }

  private billingPreview(hospitalization: HospitalizationRow, at: Date) {
    const authorization = hospitalization.careAuthorization;
    const invoice = authorization?.invoice;
    if (!authorization || !invoice) {
      return {
        billedDays: 0,
        total: 0,
        paid: 0,
        balance: 0,
        settled: true,
        settledByWaiver: false,
      };
    }
    const elapsed = at.getTime() - hospitalization.admittedAt.getTime();
    const billedDays = Math.max(1, Math.ceil(elapsed / 86_400_000));
    const unitPrice = authorization.service?.price ?? authorization.amount;
    const total = Number(unitPrice.mul(billedDays));
    const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const settledByWaiver = authorization.status === CareAuthorizationStatus.WAIVED;
    const balance = Math.max(total - paid, 0);
    return {
      billedDays,
      total,
      paid,
      balance,
      settled: settledByWaiver || balance <= 0.005,
      settledByWaiver,
    };
  }

  private async finalizeInvoice(
    hospitalization: HospitalizationRow,
    at: Date,
    transaction: Prisma.TransactionClient,
  ) {
    const authorization = hospitalization.careAuthorization;
    const invoice = authorization?.invoice;
    const preview = this.billingPreview(hospitalization, at);
    if (!authorization || !invoice) return preview;

    const unitPrice = authorization.service?.price ?? authorization.amount;
    const total = unitPrice.mul(preview.billedDays);
    const firstItem = invoice.items[0];
    if (firstItem) {
      await transaction.invoiceItem.update({
        where: { id: firstItem.id },
        data: {
          description: `${authorization.service?.name ?? authorization.description} — ${preview.billedDays} jour(s)`,
          quantity: preview.billedDays,
          unitPrice,
          total,
        },
      });
    }
    const status = preview.settled
      ? InvoiceStatus.PAID
      : preview.paid > 0
        ? InvoiceStatus.PARTIALLY_PAID
        : InvoiceStatus.PENDING;
    await transaction.invoice.update({
      where: { id: invoice.id },
      data: {
        status,
        total,
        dueAt: at,
        notes: preview.settledByWaiver
          ? `Compte de sortie — ${preview.billedDays} jour(s). Prise en charge ou exonération validée.`
          : `Compte de sortie — ${preview.billedDays} jour(s). Solde à régler avant la sortie administrative.`,
      },
    });
    await transaction.careAuthorization.update({
      where: { id: authorization.id },
      data: { amount: total, quantity: preview.billedDays },
    });
    return preview;
  }

  private present(row: HospitalizationRow, medicalDischargeApprovedAt?: Date) {
    return {
      ...row,
      medicalDischargeApprovedAt: medicalDischargeApprovedAt?.toISOString() ?? null,
      financialStatus: this.billingPreview(row, new Date()),
    };
  }
}
