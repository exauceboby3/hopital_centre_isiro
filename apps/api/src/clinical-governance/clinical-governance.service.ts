import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CareAuthorizationStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentPayer,
  Prisma,
  Role,
} from '@prisma/client';
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocatePatientAdvanceDto,
  CreateBreakGlassAccessDto,
  CreateDeathCaseDto,
  CreatePatientAdvanceDto,
  CreatePatientEpisodeDto,
  CreatePaymentPlanDto,
  DecideAdditionalExamDto,
  UpdateDeathCaseDto,
} from './dto/clinical-governance.dto';

interface EpisodeRow {
  id: string;
  number: string;
  patientId: string;
  appointmentId: string | null;
  openedById: string;
  closedById: string | null;
  title: string;
  reason: string | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AdvanceRow {
  id: string;
  number: string;
  patientId: string;
  receivedById: string;
  amount: Prisma.Decimal;
  remainingAmount: Prisma.Decimal;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  receivedAt: Date;
}

interface AdvanceAllocationRow {
  id: string;
  advanceId: string;
  invoiceId: string;
  amount: Prisma.Decimal;
  allocatedAt: Date;
}

interface PaymentPlanRow {
  id: string;
  number: string;
  patientId: string;
  createdById: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  totalAmount: Prisma.Decimal;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InstallmentRow {
  id: string;
  planId: string;
  sequence: number;
  amount: Prisma.Decimal;
  dueAt: Date;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paidAt: Date | null;
  paymentReference: string | null;
}

interface BreakGlassRow {
  id: string;
  patientId: string;
  userId: string;
  reason: string;
  startedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedById: string | null;
}

interface LabDecisionRow {
  id: string;
  examRequestId: string;
  requestGroupId: string;
  patientId: string;
  requestedById: string;
  doctorUserId: string;
  price: Prisma.Decimal;
  urgency: 'ROUTINE' | 'URGENT' | 'CRITICAL';
  reason: string;
  status: 'AUTO_APPROVED' | 'PENDING_DOCTOR' | 'APPROVED' | 'REJECTED';
  decidedById: string | null;
  decisionReason: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
}

interface DeathCaseRow {
  id: string;
  patientId: string;
  declaredById: string;
  certificateNumber: string;
  occurredAt: Date;
  cause: string;
  declaringDoctorName: string;
  declaringDoctorLicense: string | null;
  morgueTransferredAt: Date | null;
  morgueLocation: string | null;
  morgueRegisterNumber: string | null;
  familyReleasedAt: Date | null;
  recipientName: string | null;
  recipientIdentity: string | null;
  recipientRelationship: string | null;
  financialClosedAt: Date | null;
  financialClosedById: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GraceMetadata {
  kind: 'INTERNAL_GRACE';
  scope: string;
  reason: string;
  createdById: string;
}

const clinicalBreakGlassRoles = [
  Role.DOCTOR,
  Role.NURSE,
  Role.SURGEON,
  Role.MIDWIFE,
] as const;
const additionalExamThresholdCdf = Number(process.env.LAB_DOCTOR_APPROVAL_THRESHOLD_CDF ?? 50000);
const graceIssuer = 'MESURE DE GRÂCE INTERNE';

@Injectable()
export class ClinicalGovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAccess: PatientFinancialAccessService,
  ) {}

  async commandCenter(patientId: string, user: AuthenticatedUser) {
    const [financial, episodes, breakGlass, death] = await Promise.all([
      this.financialAccount(patientId),
      this.episodes(patientId),
      this.activeBreakGlass(patientId, user.id),
      this.deathDocument(patientId, false),
    ]);
    return { financial, episodes, breakGlass, death };
  }

  async financialAccount(patientId: string) {
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

    const [invoices, advances, allocations, plans, installments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { patientId },
        include: {
          payments: true,
          insuranceCoverage: true,
          voucherCoverage: true,
          careAuthorization: { include: { service: true } },
          items: true,
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.$queryRaw<AdvanceRow[]>(Prisma.sql`
        SELECT * FROM "PatientAdvance"
        WHERE "patientId" = ${patientId}
        ORDER BY "receivedAt" DESC
      `),
      this.prisma.$queryRaw<AdvanceAllocationRow[]>(Prisma.sql`
        SELECT allocation.*
        FROM "PatientAdvanceAllocation" allocation
        INNER JOIN "PatientAdvance" advance ON advance."id" = allocation."advanceId"
        WHERE advance."patientId" = ${patientId}
        ORDER BY allocation."allocatedAt" DESC
      `),
      this.prisma.$queryRaw<PaymentPlanRow[]>(Prisma.sql`
        SELECT * FROM "PaymentPlan"
        WHERE "patientId" = ${patientId}
        ORDER BY "createdAt" DESC
      `),
      this.prisma.$queryRaw<InstallmentRow[]>(Prisma.sql`
        SELECT installment.*
        FROM "PaymentInstallment" installment
        INNER JOIN "PaymentPlan" plan ON plan."id" = installment."planId"
        WHERE plan."patientId" = ${patientId}
        ORDER BY installment."dueAt" ASC
      `),
    ]);

    const activeInvoices = invoices.filter((invoice) => invoice.status !== InvoiceStatus.CANCELLED);
    const totalBilled = activeInvoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
    const totalPaid = activeInvoices.reduce(
      (sum, invoice) =>
        sum + invoice.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
      0,
    );
    const coveredAmount = activeInvoices.reduce(
      (sum, invoice) =>
        sum +
        (invoice.insuranceCoverage &&
        ['GUARANTEED', 'SETTLED'].includes(invoice.insuranceCoverage.status)
          ? Number(invoice.insuranceCoverage.insurerAmount)
          : 0) +
        (invoice.voucherCoverage &&
        ['GUARANTEED', 'SETTLED'].includes(invoice.voucherCoverage.status)
          ? Number(invoice.voucherCoverage.sponsorAmount)
          : 0),
      0,
    );
    const patientLiability = Math.max(totalBilled - coveredAmount, 0);
    const grossDebt = Math.max(patientLiability - totalPaid, 0);
    const availableAdvance = advances.reduce(
      (sum, advance) => sum + Number(advance.remainingAmount),
      0,
    );
    const netDebt = Math.max(grossDebt - availableAdvance, 0);

    const installmentGroups = plans.map((plan) => {
      const rows = installments
        .filter((installment) => installment.planId === plan.id)
        .map((installment) => ({
          ...installment,
          amount: Number(installment.amount),
          status:
            installment.status === 'PENDING' && installment.dueAt.getTime() < Date.now()
              ? 'OVERDUE'
              : installment.status,
        }));
      return { ...plan, totalAmount: Number(plan.totalAmount), installments: rows };
    });
    const nextDue = installmentGroups
      .flatMap((plan) => plan.installments)
      .filter((installment) => ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(installment.status))
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];

    return {
      patient,
      totals: {
        totalBilled,
        totalPaid,
        coveredAmount,
        patientLiability,
        grossDebt,
        availableAdvance,
        netDebt,
        nextDueAt: nextDue?.dueAt ?? null,
        nextDueAmount: nextDue?.amount ?? null,
      },
      invoices: activeInvoices.map((invoice) => {
        const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const covered =
          (invoice.insuranceCoverage &&
          ['GUARANTEED', 'SETTLED'].includes(invoice.insuranceCoverage.status)
            ? Number(invoice.insuranceCoverage.insurerAmount)
            : 0) +
          (invoice.voucherCoverage &&
          ['GUARANTEED', 'SETTLED'].includes(invoice.voucherCoverage.status)
            ? Number(invoice.voucherCoverage.sponsorAmount)
            : 0);
        return {
          id: invoice.id,
          number: invoice.number,
          issuedAt: invoice.issuedAt,
          dueAt: invoice.dueAt,
          status: invoice.status,
          description:
            invoice.careAuthorization?.description ??
            invoice.items.map((item) => item.description).join(' · ') ??
            'Facture patient',
          total: Number(invoice.total),
          paid,
          covered,
          remaining: Math.max(Number(invoice.total) - paid - covered, 0),
        };
      }),
      advances: advances.map((advance) => ({
        ...advance,
        amount: Number(advance.amount),
        remainingAmount: Number(advance.remainingAmount),
        allocations: allocations
          .filter((allocation) => allocation.advanceId === advance.id)
          .map((allocation) => ({ ...allocation, amount: Number(allocation.amount) })),
      })),
      paymentPlans: installmentGroups,
    };
  }

  async createAdvance(patientId: string, dto: CreatePatientAdvanceDto, userId: string) {
    await this.assertPatient(patientId);
    const id = randomUUID();
    const number = this.number('AVC');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PatientAdvance" (
        "id", "number", "patientId", "receivedById", "amount", "remainingAmount",
        "method", "reference", "notes", "receivedAt", "createdAt"
      ) VALUES (
        ${id}, ${number}, ${patientId}, ${userId}, ${new Prisma.Decimal(dto.amount)},
        ${new Prisma.Decimal(dto.amount)}, ${dto.method}::"PaymentMethod",
        ${dto.reference?.trim() || null}, ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'PATIENT_ADVANCE_RECEIVED',
        entity: 'PatientAdvance',
        entityId: id,
        metadata: { patientId, number, amount: dto.amount, method: dto.method },
      },
    });
    return { id, number, amount: dto.amount, remainingAmount: dto.amount };
  }

  async allocateAdvance(patientId: string, dto: AllocatePatientAdvanceDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const advances = await transaction.$queryRaw<AdvanceRow[]>(Prisma.sql`
        SELECT * FROM "PatientAdvance"
        WHERE "id" = ${dto.advanceId} AND "patientId" = ${patientId}
        FOR UPDATE
      `);
      const advance = advances[0];
      if (!advance) throw new NotFoundException('Avance patient introuvable.');
      const invoice = await transaction.invoice.findFirst({
        where: { id: dto.invoiceId, patientId, status: { not: InvoiceStatus.CANCELLED } },
        include: { payments: true, insuranceCoverage: true, voucherCoverage: true },
      });
      if (!invoice) throw new NotFoundException('Facture patient introuvable.');

      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const covered =
        (invoice.insuranceCoverage &&
        ['GUARANTEED', 'SETTLED'].includes(invoice.insuranceCoverage.status)
          ? Number(invoice.insuranceCoverage.insurerAmount)
          : 0) +
        (invoice.voucherCoverage && ['GUARANTEED', 'SETTLED'].includes(invoice.voucherCoverage.status)
          ? Number(invoice.voucherCoverage.sponsorAmount)
          : 0);
      const remaining = Math.max(Number(invoice.total) - paid - covered, 0);
      const amount = Math.min(dto.amount, Number(advance.remainingAmount), remaining);
      if (amount <= 0) {
        throw new BadRequestException('Aucun montant ne peut être imputé à cette facture.');
      }

      const payment = await transaction.payment.create({
        data: {
          invoiceId: invoice.id,
          receivedById: userId,
          amount: new Prisma.Decimal(amount),
          method: advance.method,
          payerType: PaymentPayer.PATIENT,
          reference: `${advance.number}${advance.reference ? ` · ${advance.reference}` : ''}`,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "PatientAdvanceAllocation" (
          "id", "advanceId", "invoiceId", "allocatedById", "amount", "allocatedAt"
        ) VALUES (
          ${randomUUID()}, ${advance.id}, ${invoice.id}, ${userId},
          ${new Prisma.Decimal(amount)}, CURRENT_TIMESTAMP
        )
      `);
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "PatientAdvance"
        SET "remainingAmount" = "remainingAmount" - ${new Prisma.Decimal(amount)}
        WHERE "id" = ${advance.id}
      `);

      const cleared = paid + covered + amount >= Number(invoice.total);
      await transaction.invoice.update({
        where: { id: invoice.id },
        data: { status: cleared ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID },
      });
      if (cleared) {
        await transaction.careAuthorization.updateMany({
          where: { invoiceId: invoice.id, status: CareAuthorizationStatus.PENDING },
          data: { status: CareAuthorizationStatus.AUTHORIZED, authorizedAt: new Date() },
        });
      }
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PATIENT_ADVANCE_ALLOCATED',
          entity: 'Payment',
          entityId: payment.id,
          metadata: { patientId, invoiceId: invoice.id, advanceId: advance.id, amount },
        },
      });
      return { payment, allocatedAmount: amount, invoiceCleared: cleared };
    });
  }

  async createPaymentPlan(patientId: string, dto: CreatePaymentPlanDto, userId: string) {
    const account = await this.financialAccount(patientId);
    const total = account.totals.netDebt;
    if (total <= 0) throw new BadRequestException('Le patient ne possède aucune dette à échelonner.');

    const id = randomUUID();
    const number = this.number('ECH');
    const totalCents = Math.round(total * 100);
    const baseCents = Math.floor(totalCents / dto.installmentCount);
    const firstDueAt = new Date(dto.firstDueAt);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "PaymentPlan" (
          "id", "number", "patientId", "createdById", "status", "totalAmount", "notes",
          "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${number}, ${patientId}, ${userId}, 'ACTIVE', ${new Prisma.Decimal(total)},
          ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
      for (let index = 0; index < dto.installmentCount; index += 1) {
        const dueAt = new Date(firstDueAt);
        dueAt.setUTCDate(dueAt.getUTCDate() + index * dto.intervalDays);
        const cents =
          index === dto.installmentCount - 1
            ? totalCents - baseCents * (dto.installmentCount - 1)
            : baseCents;
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "PaymentInstallment" (
            "id", "planId", "sequence", "amount", "dueAt", "status", "createdAt"
          ) VALUES (
            ${randomUUID()}, ${id}, ${index + 1}, ${new Prisma.Decimal(cents / 100)},
            ${dueAt}, 'PENDING', CURRENT_TIMESTAMP
          )
        `);
      }
      await transaction.auditLog.create({
        data: {
          userId,
          action: 'PATIENT_PAYMENT_PLAN_CREATED',
          entity: 'PaymentPlan',
          entityId: id,
          metadata: {
            patientId,
            number,
            total,
            installmentCount: dto.installmentCount,
            intervalDays: dto.intervalDays,
          },
        },
      });
    });
    return { id, number, totalAmount: total };
  }

  async ensureEpisodeForAppointment(appointmentId: string, openedById?: string) {
    const existing = await this.prisma.$queryRaw<EpisodeRow[]>(Prisma.sql`
      SELECT * FROM "PatientEpisode" WHERE "appointmentId" = ${appointmentId} LIMIT 1
    `);
    if (existing[0]) return existing[0];

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        patientId: true,
        createdById: true,
        service: true,
        reason: true,
        scheduledAt: true,
      },
    });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable pour créer l’épisode.');
    const id = randomUUID();
    const number = this.number('EPI');
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PatientEpisode" (
        "id", "number", "patientId", "appointmentId", "openedById", "title", "reason",
        "status", "openedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${appointment.patientId}, ${appointment.id},
        ${openedById ?? appointment.createdById}, ${appointment.service},
        ${appointment.reason ?? null}, 'OPEN', ${appointment.scheduledAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("appointmentId") DO NOTHING
    `);
    const rows = await this.prisma.$queryRaw<EpisodeRow[]>(Prisma.sql`
      SELECT * FROM "PatientEpisode" WHERE "appointmentId" = ${appointmentId} LIMIT 1
    `);
    return rows[0];
  }

  async episodes(patientId: string) {
    await this.assertPatient(patientId);
    const appointments = await this.prisma.appointment.findMany({
      where: { patientId },
      select: { id: true, createdById: true },
      orderBy: { scheduledAt: 'asc' },
    });
    for (const appointment of appointments) {
      await this.ensureEpisodeForAppointment(appointment.id, appointment.createdById);
    }

    const episodes = await this.prisma.$queryRaw<EpisodeRow[]>(Prisma.sql`
      SELECT * FROM "PatientEpisode"
      WHERE "patientId" = ${patientId}
      ORDER BY "openedAt" DESC
    `);
    const detailed = [];
    for (const episode of episodes) {
      const appointment = episode.appointmentId
        ? await this.prisma.appointment.findUnique({
            where: { id: episode.appointmentId },
            include: {
              doctor: true,
              consultation: {
                include: {
                  examRequests: { orderBy: { requestedAt: 'asc' } },
                  prescriptions: {
                    include: { items: { include: { medication: true } }, invoice: true },
                  },
                  nursingCare: { orderBy: { scheduledAt: 'asc' } },
                },
              },
              careAuthorization: { include: { invoice: true } },
            },
          })
        : null;
      detailed.push({ ...episode, appointment });
    }
    return detailed;
  }

  async createEpisode(patientId: string, dto: CreatePatientEpisodeDto, userId: string) {
    await this.assertPatient(patientId);
    const id = randomUUID();
    const number = this.number('EPI');
    const openedAt = dto.openedAt ? new Date(dto.openedAt) : new Date();
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "PatientEpisode" (
        "id", "number", "patientId", "openedById", "title", "reason", "status",
        "openedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${patientId}, ${userId}, ${dto.title.trim()},
        ${dto.reason?.trim() || null}, 'OPEN', ${openedAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    return { id, number, openedAt };
  }

  async closeEpisode(id: string, userId: string) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "PatientEpisode"
      SET "status" = 'CLOSED', "closedAt" = CURRENT_TIMESTAMP,
          "closedById" = ${userId}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" = 'OPEN'
    `);
    if (!count) throw new NotFoundException('Épisode ouvert introuvable.');
    return { id, status: 'CLOSED' };
  }

  async grantBreakGlass(patientId: string, dto: CreateBreakGlassAccessDto, user: AuthenticatedUser) {
    if (!hasAnyRole(user, clinicalBreakGlassRoles)) {
      throw new ForbiddenException('Le bris de glace est réservé aux professionnels cliniques autorisés.');
    }
    await this.assertPatient(patientId);
    const expiresAt = new Date(dto.expiresAt);
    const duration = expiresAt.getTime() - Date.now();
    if (duration < 60_000 || duration > 30 * 60_000) {
      throw new BadRequestException('Le bris de glace doit durer entre 1 et 30 minutes.');
    }
    const id = randomUUID();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "BreakGlassAccess" (
          "id", "patientId", "userId", "reason", "startedAt", "expiresAt", "createdAt"
        ) VALUES (
          ${id}, ${patientId}, ${user.id}, ${dto.reason.trim()}, CURRENT_TIMESTAMP,
          ${expiresAt}, CURRENT_TIMESTAMP
        )
      `);
      const patient = await transaction.patient.findUniqueOrThrow({
        where: { id: patientId },
        select: { medicalRecordNumber: true, lastName: true, postName: true, firstName: true },
      });
      const administrators = await transaction.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
            { additionalRoles: { hasSome: [Role.SUPER_ADMIN, Role.ADMIN] } },
          ],
        },
        select: { id: true },
      });
      if (administrators.length) {
        const name = [patient.lastName, patient.postName, patient.firstName].filter(Boolean).join(' ');
        await transaction.message.createMany({
          data: administrators.map((administrator) => ({
            senderId: user.id,
            receiverId: administrator.id,
            content: `BRIS DE GLACE : ${user.username} a ouvert temporairement le dossier de ${name} (${patient.medicalRecordNumber}) jusqu’au ${expiresAt.toLocaleString('fr-FR')}. Motif : ${dto.reason.trim()}`,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'PATIENT_BREAK_GLASS_OPENED',
          entity: 'BreakGlassAccess',
          entityId: id,
          metadata: { patientId, expiresAt: expiresAt.toISOString(), reason: dto.reason.trim() },
        },
      });
    });
    return { id, patientId, startedAt: new Date(), expiresAt, reason: dto.reason.trim() };
  }

  async revokeBreakGlass(id: string, user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<BreakGlassRow[]>(Prisma.sql`
      SELECT * FROM "BreakGlassAccess" WHERE "id" = ${id} LIMIT 1
    `);
    const access = rows[0];
    if (!access) throw new NotFoundException('Accès bris de glace introuvable.');
    if (access.userId !== user.id && !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) {
      throw new ForbiddenException('Vous ne pouvez pas révoquer cet accès.');
    }
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "BreakGlassAccess"
      SET "revokedAt" = CURRENT_TIMESTAMP, "revokedById" = ${user.id}
      WHERE "id" = ${id} AND "revokedAt" IS NULL
    `);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PATIENT_BREAK_GLASS_REVOKED',
        entity: 'BreakGlassAccess',
        entityId: id,
        metadata: { patientId: access.patientId },
      },
    });
    return { id, revoked: true };
  }

  async activeBreakGlass(patientId: string, userId: string) {
    const rows = await this.prisma.$queryRaw<BreakGlassRow[]>(Prisma.sql`
      SELECT * FROM "BreakGlassAccess"
      WHERE "patientId" = ${patientId} AND "userId" = ${userId}
        AND "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
      ORDER BY "startedAt" DESC LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async graceReport(from?: string, to?: string) {
    const start = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(to) : new Date();
    const vouchers = await this.prisma.careVoucher.findMany({
      where: {
        issuerName: graceIssuer,
        createdAt: { gte: start, lte: end },
      },
      include: { patient: true, createdBy: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const rows = [];
    for (const voucher of vouchers) {
      const metadata = this.parseGrace(voucher.notes);
      const validFrom = voucher.validFrom ?? voucher.createdAt;
      const validUntil = voucher.validUntil ?? voucher.createdAt;
      const invoices = await this.prisma.invoice.findMany({
        where: {
          patientId: voucher.patientId,
          issuedAt: { gte: validFrom, lte: validUntil },
          status: { not: InvoiceStatus.CANCELLED },
        },
        include: { payments: true, careAuthorization: true },
      });
      const billed = invoices.reduce((sum, invoice) => sum + Number(invoice.total), 0);
      const paid = invoices.reduce(
        (sum, invoice) =>
          sum + invoice.payments.reduce((paymentSum, payment) => paymentSum + Number(payment.amount), 0),
        0,
      );
      rows.push({
        id: voucher.id,
        number: voucher.number,
        patient: voucher.patient,
        createdBy: voucher.createdBy,
        scope: metadata?.scope ?? 'ALL_CARE',
        reason: metadata?.reason ?? voucher.notes ?? '',
        validFrom,
        validUntil,
        status: voucher.status,
        remainingMinutes: Math.max(Math.floor((validUntil.getTime() - Date.now()) / 60_000), 0),
        billedDuringGrace: billed,
        paidDuringGrace: paid,
        debtCreatedDuringGrace: Math.max(billed - paid, 0),
        acts: invoices.map((invoice) => ({
          invoiceId: invoice.id,
          number: invoice.number,
          description: invoice.careAuthorization?.description ?? 'Acte facturé',
          total: Number(invoice.total),
          status: invoice.status,
          issuedAt: invoice.issuedAt,
        })),
      });
    }
    return {
      period: { from: start, to: end },
      totals: {
        authorizations: rows.length,
        billed: rows.reduce((sum, row) => sum + row.billedDuringGrace, 0),
        debt: rows.reduce((sum, row) => sum + row.debtCreatedDuringGrace, 0),
      },
      rows,
    };
  }

  async graceAlerts() {
    const vouchers = await this.prisma.careVoucher.findMany({
      where: {
        issuerName: graceIssuer,
        status: 'ACTIVE',
        validUntil: { gt: new Date() },
      },
      include: { patient: true },
      orderBy: { validUntil: 'asc' },
    });
    const alerts = [];
    for (const voucher of vouchers) {
      if (!voucher.validUntil) continue;
      const minutes = Math.max(Math.floor((voucher.validUntil.getTime() - Date.now()) / 60_000), 0);
      const threshold = minutes <= 15 ? 15 : minutes <= 60 ? 60 : minutes <= 360 ? 360 : null;
      if (!threshold) continue;
      const action = `GRACE_EXPIRY_ALERT_${threshold}`;
      const alreadySent = await this.prisma.auditLog.count({
        where: { action, entity: 'CareVoucher', entityId: voucher.id },
      });
      if (!alreadySent) {
        const admins = await this.prisma.user.findMany({
          where: {
            isActive: true,
            OR: [
              { role: { in: [Role.SUPER_ADMIN, Role.ADMIN] } },
              { additionalRoles: { hasSome: [Role.SUPER_ADMIN, Role.ADMIN] } },
            ],
          },
          select: { id: true },
        });
        if (admins.length) {
          await this.prisma.message.createMany({
            data: admins.map((admin) => ({
              senderId: voucher.createdById,
              receiverId: admin.id,
              content: `Alerte mesure de grâce : ${voucher.number} pour ${voucher.patient.medicalRecordNumber} expire dans environ ${minutes} minute(s).`,
            })),
          });
        }
        await this.prisma.auditLog.create({
          data: {
            userId: voucher.createdById,
            action,
            entity: 'CareVoucher',
            entityId: voucher.id,
            metadata: { patientId: voucher.patientId, minutesRemaining: minutes },
          },
        });
      }
      alerts.push({
        id: voucher.id,
        number: voucher.number,
        patient: voucher.patient,
        validUntil: voucher.validUntil,
        remainingMinutes: minutes,
        thresholdMinutes: threshold,
      });
    }
    return alerts;
  }

  async registerAdditionalExamDecision(
    transaction: Prisma.TransactionClient,
    input: {
      examRequestId: string;
      requestGroupId: string;
      patientId: string;
      requestedById: string;
      doctorUserId: string;
      price: number;
      urgency: 'ROUTINE' | 'URGENT' | 'CRITICAL';
      reason: string;
    },
  ) {
    const autoApproved = input.price <= additionalExamThresholdCdf || input.urgency !== 'ROUTINE';
    const status = autoApproved ? 'AUTO_APPROVED' : 'PENDING_DOCTOR';
    const id = randomUUID();
    await transaction.$executeRaw(Prisma.sql`
      INSERT INTO "LabAdditionalExamDecision" (
        "id", "examRequestId", "requestGroupId", "patientId", "requestedById",
        "doctorUserId", "price", "urgency", "reason", "status", "requestedAt"
      ) VALUES (
        ${id}, ${input.examRequestId}, ${input.requestGroupId}, ${input.patientId},
        ${input.requestedById}, ${input.doctorUserId}, ${new Prisma.Decimal(input.price)},
        ${input.urgency}, ${input.reason}, ${status}, CURRENT_TIMESTAMP
      )
    `);
    return { id, status, thresholdCdf: additionalExamThresholdCdf };
  }

  async pendingAdditionalExams(user: AuthenticatedUser) {
    const admin = hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);
    const rows = await this.prisma.$queryRaw<LabDecisionRow[]>(admin
      ? Prisma.sql`
          SELECT * FROM "LabAdditionalExamDecision"
          WHERE "status" = 'PENDING_DOCTOR'
          ORDER BY "requestedAt" ASC
        `
      : Prisma.sql`
          SELECT * FROM "LabAdditionalExamDecision"
          WHERE "status" = 'PENDING_DOCTOR' AND "doctorUserId" = ${user.id}
          ORDER BY "requestedAt" ASC
        `);
    const result = [];
    for (const row of rows) {
      const exam = await this.prisma.examRequest.findUnique({
        where: { id: row.examRequestId },
        include: { patient: true, careAuthorization: { include: { invoice: true, service: true } } },
      });
      result.push({ ...row, price: Number(row.price), exam });
    }
    return result;
  }

  async decideAdditionalExam(id: string, dto: DecideAdditionalExamDto, user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<LabDecisionRow[]>(Prisma.sql`
      SELECT * FROM "LabAdditionalExamDecision" WHERE "id" = ${id} LIMIT 1
    `);
    const decision = rows[0];
    if (!decision) throw new NotFoundException('Décision d’examen complémentaire introuvable.');
    if (decision.status !== 'PENDING_DOCTOR') {
      throw new BadRequestException('Cette demande a déjà reçu une décision.');
    }
    if (
      decision.doctorUserId !== user.id &&
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])
    ) {
      throw new ForbiddenException('Seul le médecin demandeur ou un administrateur peut décider.');
    }
    const nextStatus = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "LabAdditionalExamDecision"
        SET "status" = ${nextStatus}, "decidedById" = ${user.id},
            "decisionReason" = ${dto.reason.trim()}, "decidedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `);
      if (nextStatus === 'REJECTED') {
        const exam = await transaction.examRequest.findUnique({
          where: { id: decision.examRequestId },
          include: { careAuthorization: true },
        });
        if (exam) {
          await transaction.examRequest.update({
            where: { id: exam.id },
            data: { status: 'CANCELLED', reviewComment: `Rejet médical : ${dto.reason.trim()}` },
          });
          if (exam.careAuthorization) {
            await transaction.careAuthorization.update({
              where: { id: exam.careAuthorization.id },
              data: { status: CareAuthorizationStatus.CANCELLED },
            });
            await transaction.invoice.update({
              where: { id: exam.careAuthorization.invoiceId },
              data: {
                status: InvoiceStatus.CANCELLED,
                notes: `Examen complémentaire rejeté par le médecin : ${dto.reason.trim()}`,
              },
            });
          }
        }
      }
      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          OR: [
            { id: decision.requestedById },
            { role: { in: [Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER] } },
            { additionalRoles: { hasSome: [Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER] } },
          ],
        },
        select: { id: true },
      });
      if (recipients.length) {
        await transaction.message.createMany({
          data: recipients.map((recipient) => ({
            senderId: user.id,
            receiverId: recipient.id,
            content: `Examen complémentaire ${nextStatus === 'APPROVED' ? 'approuvé' : 'rejeté'} : ${dto.reason.trim()}.`,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: `LAB_ADDITIONAL_EXAM_${nextStatus}`,
          entity: 'LabAdditionalExamDecision',
          entityId: id,
          metadata: { examRequestId: decision.examRequestId, reason: dto.reason.trim() },
        },
      });
    });
    return { id, status: nextStatus };
  }

  async createDeathCase(patientId: string, dto: CreateDeathCaseDto, user: AuthenticatedUser) {
    const existing = await this.prisma.$queryRaw<DeathCaseRow[]>(Prisma.sql`
      SELECT * FROM "DeathCase" WHERE "patientId" = ${patientId} LIMIT 1
    `);
    if (existing[0]) throw new BadRequestException('Un constat de décès existe déjà pour ce patient.');

    await this.financialAccess.declareDeath(
      patientId,
      { occurredAt: dto.occurredAt, reason: dto.cause, notes: dto.notes },
      user.id,
    );
    const id = randomUUID();
    const certificateNumber = this.number('DEC');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "DeathCase" (
          "id", "patientId", "declaredById", "certificateNumber", "occurredAt", "cause",
          "declaringDoctorName", "declaringDoctorLicense", "morgueTransferredAt",
          "morgueLocation", "morgueRegisterNumber", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${patientId}, ${user.id}, ${certificateNumber}, ${new Date(dto.occurredAt)},
          ${dto.cause.trim()}, ${dto.declaringDoctorName.trim()},
          ${dto.declaringDoctorLicense?.trim() || null},
          ${dto.morgueTransferredAt ? new Date(dto.morgueTransferredAt) : null},
          ${dto.morgueLocation?.trim() || null}, ${dto.morgueRegisterNumber?.trim() || null},
          ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `);
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'DEATH_CERTIFICATE_CREATED',
          entity: 'DeathCase',
          entityId: id,
          metadata: { patientId, certificateNumber },
        },
      });
    });
    return this.deathDocument(patientId, true);
  }

  async updateDeathCase(id: string, dto: UpdateDeathCaseDto, user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<DeathCaseRow[]>(Prisma.sql`
      SELECT * FROM "DeathCase" WHERE "id" = ${id} LIMIT 1
    `);
    const current = rows[0];
    if (!current) throw new NotFoundException('Dossier de décès introuvable.');
    const financialClosedAt = dto.closeFinancialAccount ? new Date() : current.financialClosedAt;
    const financialClosedById = dto.closeFinancialAccount ? user.id : current.financialClosedById;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "DeathCase" SET
        "morgueTransferredAt" = ${dto.morgueTransferredAt ? new Date(dto.morgueTransferredAt) : current.morgueTransferredAt},
        "morgueLocation" = ${dto.morgueLocation?.trim() ?? current.morgueLocation},
        "morgueRegisterNumber" = ${dto.morgueRegisterNumber?.trim() ?? current.morgueRegisterNumber},
        "familyReleasedAt" = ${dto.familyReleasedAt ? new Date(dto.familyReleasedAt) : current.familyReleasedAt},
        "recipientName" = ${dto.recipientName?.trim() ?? current.recipientName},
        "recipientIdentity" = ${dto.recipientIdentity?.trim() ?? current.recipientIdentity},
        "recipientRelationship" = ${dto.recipientRelationship?.trim() ?? current.recipientRelationship},
        "financialClosedAt" = ${financialClosedAt},
        "financialClosedById" = ${financialClosedById},
        "notes" = ${dto.notes?.trim() ?? current.notes},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
    `);
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'DEATH_CASE_UPDATED',
        entity: 'DeathCase',
        entityId: id,
        metadata: { patientId: current.patientId, financialClosed: Boolean(dto.closeFinancialAccount) },
      },
    });
    return this.deathDocument(current.patientId, true);
  }

  async deathDocument(patientId: string, required = true) {
    const rows = await this.prisma.$queryRaw<DeathCaseRow[]>(Prisma.sql`
      SELECT * FROM "DeathCase" WHERE "patientId" = ${patientId} LIMIT 1
    `);
    const death = rows[0];
    if (!death) {
      if (required) throw new NotFoundException('Constat de décès introuvable.');
      return null;
    }
    const [patient, hospital, declaredBy, financialClosedBy] = await Promise.all([
      this.prisma.patient.findUnique({ where: { id: patientId }, omit: { identityKey: true } }),
      this.prisma.hospitalProfile.findUnique({ where: { id: 'main' } }),
      this.prisma.user.findUnique({ where: { id: death.declaredById }, select: { username: true } }),
      death.financialClosedById
        ? this.prisma.user.findUnique({
            where: { id: death.financialClosedById },
            select: { username: true },
          })
        : null,
    ]);
    return { death, patient, hospital, declaredBy, financialClosedBy };
  }

  async doctorWaitingRoom(user: AuthenticatedUser, doctorId?: string) {
    let targetDoctorId = doctorId;
    if (!hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) {
      const profile = await this.prisma.doctorProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!profile) throw new ForbiddenException('Profil médecin requis pour la salle d’attente.');
      targetDoctorId = profile.id;
    }
    const rows = await this.prisma.appointment.findMany({
      where: {
        ...(targetDoctorId ? { doctorId: targetDoctorId } : {}),
        status: 'CHECKED_IN',
        doctorAcknowledgedAt: null,
        journeyStage: { in: ['WAITING_DOCTOR', 'RETURN_TO_DOCTOR'] },
      },
      include: { patient: true, doctor: true },
      orderBy: [{ journeyUpdatedAt: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
    const now = Date.now();
    return rows.map((appointment, index) => ({
      id: appointment.id,
      queuePosition: index + 1,
      arrivalAt: appointment.journeyUpdatedAt,
      waitingMinutes: Math.max(
        Math.floor((now - appointment.journeyUpdatedAt.getTime()) / 60_000),
        0,
      ),
      service: appointment.service,
      reason: appointment.reason,
      journeyStage: appointment.journeyStage,
      patient: appointment.patient,
      doctor: appointment.doctor,
    }));
  }

  private async assertPatient(patientId: string) {
    const count = await this.prisma.patient.count({ where: { id: patientId, archivedAt: null } });
    if (!count) throw new NotFoundException('Patient actif introuvable.');
  }

  private parseGrace(value: string | null): GraceMetadata | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as Partial<GraceMetadata>;
      return parsed.kind === 'INTERNAL_GRACE' && typeof parsed.reason === 'string'
        ? (parsed as GraceMetadata)
        : null;
    } catch {
      return null;
    }
  }

  medicationSignature(input: {
    nursingCareId: string;
    patientId: string;
    nurseId: string;
    status: string;
    performedAt: Date;
    administeredDose?: string;
  }) {
    return createHash('sha256')
      .update(
        [
          input.nursingCareId,
          input.patientId,
          input.nurseId,
          input.status,
          input.performedAt.toISOString(),
          input.administeredDose ?? '',
        ].join('|'),
      )
      .digest('hex');
  }

  private number(prefix: string) {
    return `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
