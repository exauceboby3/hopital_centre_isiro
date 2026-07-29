import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAmendmentDto,
  CreateClinicalAlertDto,
  CreateConsentDto,
  CreateDischargeSummaryDto,
  CreateFollowUpDto,
  CreateNursingHandoffDto,
  CreateSpecimenDto,
  CreateTriageDto,
  DecideAmendmentDto,
  UpdateBedTurnoverDto,
  UpdateSpecimenDto,
  VerifyIdentityDto,
} from './dto/clinical-safety.dto';

const triagePriority: Record<string, number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

const specimenTransitions: Record<string, string[]> = {
  ORDERED: ['COLLECTED', 'REJECTED'],
  COLLECTED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['IN_ANALYSIS', 'REJECTED'],
  IN_ANALYSIS: ['COMPLETED', 'REJECTED'],
  REJECTED: [],
  COMPLETED: [],
};

@Injectable()
export class ClinicalSafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async createTriage(patientId: string, dto: CreateTriageDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    if (dto.appointmentId) {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: { patientId: true },
      });
      if (!appointment || appointment.patientId !== patientId) {
        throw new BadRequestException('Le rendez-vous sélectionné ne correspond pas au patient.');
      }
    }

    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "TriageAssessment" (
        "id", "patientId", "appointmentId", "assessedById", "level", "chiefComplaint",
        "painScore", "consciousness", "breathing", "bleeding", "pregnancyStatus", "notes",
        "assessedAt", "createdAt"
      ) VALUES (
        ${id}, ${patientId}, ${dto.appointmentId ?? null}, ${user.id}, ${dto.level},
        ${dto.chiefComplaint.trim()}, ${dto.painScore ?? null}, ${dto.consciousness?.trim() || null},
        ${dto.breathing?.trim() || null}, ${dto.bleeding?.trim() || null},
        ${dto.pregnancyStatus?.trim() || null}, ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("appointmentId") DO UPDATE SET
        "assessedById" = EXCLUDED."assessedById",
        "level" = EXCLUDED."level",
        "chiefComplaint" = EXCLUDED."chiefComplaint",
        "painScore" = EXCLUDED."painScore",
        "consciousness" = EXCLUDED."consciousness",
        "breathing" = EXCLUDED."breathing",
        "bleeding" = EXCLUDED."bleeding",
        "pregnancyStatus" = EXCLUDED."pregnancyStatus",
        "notes" = EXCLUDED."notes",
        "assessedAt" = CURRENT_TIMESTAMP
      RETURNING *
    `);
    await this.audit(user.id, 'TRIAGE_RECORDED', 'Patient', patientId, {
      appointmentId: dto.appointmentId,
      level: dto.level,
      priority: triagePriority[dto.level],
    });
    return rows[0];
  }

  async triageHistory(patientId: string) {
    await this.ensurePatient(patientId);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT t.*, u."username" AS "assessedBy"
      FROM "TriageAssessment" t
      JOIN "User" u ON u."id" = t."assessedById"
      WHERE t."patientId" = ${patientId}
      ORDER BY t."assessedAt" DESC
    `);
  }

  async doctorQueue(user: AuthenticatedUser, doctorId?: string) {
    const admin = hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);
    const clinician = hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    if (!admin && !clinician) throw new ForbiddenException('Accès médecin requis.');

    const doctorFilter = admin
      ? doctorId
        ? Prisma.sql`AND a."doctorId" = ${doctorId}`
        : Prisma.empty
      : Prisma.sql`AND d."userId" = ${user.id}`;

    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        a."id",
        a."service",
        a."scheduledAt",
        a."journeyStage",
        a."journeyUpdatedAt" AS "arrivedAt",
        a."doctorAcknowledgedAt",
        p."id" AS "patientId",
        p."medicalRecordNumber",
        p."lastName",
        p."postName",
        p."firstName",
        d."id" AS "doctorId",
        d."lastName" AS "doctorLastName",
        d."postName" AS "doctorPostName",
        d."firstName" AS "doctorFirstName",
        d."specialty",
        COALESCE(t."level", 'GREEN') AS "triageLevel",
        t."chiefComplaint",
        t."painScore",
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a."journeyUpdatedAt"))::integer AS "waitingSeconds",
        ROW_NUMBER() OVER (
          PARTITION BY a."doctorId"
          ORDER BY
            CASE COALESCE(t."level", 'GREEN')
              WHEN 'RED' THEN 1 WHEN 'ORANGE' THEN 2 WHEN 'YELLOW' THEN 3 WHEN 'GREEN' THEN 4 ELSE 5
            END,
            a."journeyUpdatedAt" ASC
        )::integer AS "position"
      FROM "Appointment" a
      JOIN "Patient" p ON p."id" = a."patientId"
      JOIN "DoctorProfile" d ON d."id" = a."doctorId"
      LEFT JOIN "TriageAssessment" t ON t."appointmentId" = a."id"
      WHERE a."status" = 'CHECKED_IN'
        AND a."journeyStage" IN ('WAITING_DOCTOR', 'RETURN_TO_DOCTOR')
        ${doctorFilter}
      ORDER BY
        CASE COALESCE(t."level", 'GREEN')
          WHEN 'RED' THEN 1 WHEN 'ORANGE' THEN 2 WHEN 'YELLOW' THEN 3 WHEN 'GREEN' THEN 4 ELSE 5
        END,
        a."journeyUpdatedAt" ASC
    `);
  }

  async createAlert(patientId: string, dto: CreateClinicalAlertDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "PatientClinicalAlert" (
        "id", "patientId", "createdById", "type", "severity", "label", "details", "isActive", "createdAt"
      ) VALUES (
        ${id}, ${patientId}, ${user.id}, ${dto.type}, ${dto.severity}, ${dto.label.trim()},
        ${dto.details?.trim() || null}, true, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    await this.audit(user.id, 'CLINICAL_ALERT_CREATED', 'PatientClinicalAlert', id, {
      patientId,
      type: dto.type,
      severity: dto.severity,
    });
    return rows[0];
  }

  async alerts(patientId: string, includeResolved = false) {
    await this.ensurePatient(patientId);
    const resolvedFilter = includeResolved ? Prisma.empty : Prisma.sql`AND a."isActive" = true`;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a.*, creator."username" AS "createdBy", resolver."username" AS "resolvedBy"
      FROM "PatientClinicalAlert" a
      JOIN "User" creator ON creator."id" = a."createdById"
      LEFT JOIN "User" resolver ON resolver."id" = a."resolvedById"
      WHERE a."patientId" = ${patientId} ${resolvedFilter}
      ORDER BY
        CASE a."severity" WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
        a."createdAt" DESC
    `);
  }

  async resolveAlert(id: string, user: AuthenticatedUser) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "PatientClinicalAlert"
      SET "isActive" = false, "resolvedAt" = CURRENT_TIMESTAMP, "resolvedById" = ${user.id}
      WHERE "id" = ${id} AND "isActive" = true
    `);
    if (!count) throw new NotFoundException('Alerte clinique active introuvable.');
    await this.audit(user.id, 'CLINICAL_ALERT_RESOLVED', 'PatientClinicalAlert', id);
    return { id, resolved: true };
  }

  async verifyIdentity(patientId: string, dto: VerifyIdentityDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const confirmations = [dto.nameConfirmed, dto.recordNumberConfirmed, dto.birthDateConfirmed].filter(Boolean)
      .length;
    const contextualCode =
      dto.context === 'MEDICATION'
        ? Boolean(dto.medicationCode)
        : dto.context === 'SPECIMEN'
          ? Boolean(dto.specimenCode)
          : true;
    const success = confirmations >= 2 && contextualCode;
    const id = randomUUID();
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "IdentityVerification" (
        "id", "patientId", "verifiedById", "context", "nameConfirmed", "recordNumberConfirmed",
        "birthDateConfirmed", "braceletCode", "medicationCode", "specimenCode", "success", "notes", "verifiedAt"
      ) VALUES (
        ${id}, ${patientId}, ${user.id}, ${dto.context}, ${dto.nameConfirmed}, ${dto.recordNumberConfirmed},
        ${dto.birthDateConfirmed}, ${dto.braceletCode?.trim() || null}, ${dto.medicationCode?.trim() || null},
        ${dto.specimenCode?.trim() || null}, ${success}, ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP
      )
    `);
    await this.audit(user.id, success ? 'IDENTITY_VERIFIED' : 'IDENTITY_VERIFICATION_FAILED', 'Patient', patientId, {
      context: dto.context,
      verificationId: id,
    });
    if (!success) {
      throw new BadRequestException(
        'Identité non confirmée : validez au moins deux identifiants et le code de l’acte concerné.',
      );
    }
    return { id, success: true, verifiedAt: new Date().toISOString() };
  }

  async createSpecimen(dto: CreateSpecimenDto, user: AuthenticatedUser) {
    const exam = await this.prisma.examRequest.findUnique({
      where: { id: dto.examRequestId },
      select: { id: true, patientId: true, type: true },
    });
    if (!exam) throw new NotFoundException('Demande de laboratoire introuvable.');
    const existing = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "LabSpecimen" WHERE "examRequestId" = ${dto.examRequestId} LIMIT 1
    `);
    if (existing.length) throw new BadRequestException('Un prélèvement existe déjà pour cet examen.');

    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const code = `SPC-${stamp}-${suffix}`;
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "LabSpecimen" (
        "id", "code", "barcode", "examRequestId", "patientId", "specimenType", "status", "notes", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${code}, ${code}, ${dto.examRequestId}, ${exam.patientId}, ${dto.specimenType.trim()},
        'ORDERED', ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    await this.audit(user.id, 'LAB_SPECIMEN_CREATED', 'LabSpecimen', id, {
      examRequestId: dto.examRequestId,
      patientId: exam.patientId,
      code,
    });
    return { ...rows[0], examType: exam.type };
  }

  async specimens(status?: string, patientId?: string) {
    const statusFilter = status ? Prisma.sql`AND s."status" = ${status}` : Prisma.empty;
    const patientFilter = patientId ? Prisma.sql`AND s."patientId" = ${patientId}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        s.*, e."type" AS "examType", e."requestGroupId", e."status" AS "examStatus",
        p."medicalRecordNumber", p."lastName", p."postName", p."firstName",
        collector."username" AS "collectedBy", receiver."username" AS "receivedBy"
      FROM "LabSpecimen" s
      JOIN "ExamRequest" e ON e."id" = s."examRequestId"
      JOIN "Patient" p ON p."id" = s."patientId"
      LEFT JOIN "User" collector ON collector."id" = s."collectedById"
      LEFT JOIN "User" receiver ON receiver."id" = s."receivedById"
      WHERE 1 = 1 ${statusFilter} ${patientFilter}
      ORDER BY s."createdAt" DESC
      LIMIT 500
    `);
  }

  async updateSpecimen(id: string, dto: UpdateSpecimenDto, user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<Array<{ status: string; examRequestId: string; patientId: string }>>(
      Prisma.sql`SELECT "status", "examRequestId", "patientId" FROM "LabSpecimen" WHERE "id" = ${id} LIMIT 1`,
    );
    const current = rows[0];
    if (!current) throw new NotFoundException('Prélèvement introuvable.');
    if (!specimenTransitions[current.status]?.includes(dto.status)) {
      throw new BadRequestException(`Passage de ${current.status} vers ${dto.status} interdit.`);
    }
    if (dto.status === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Le motif du rejet du prélèvement est obligatoire.');
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "LabSpecimen"
        SET
          "status" = ${dto.status},
          "collectedById" = CASE WHEN ${dto.status} = 'COLLECTED' THEN ${user.id} ELSE "collectedById" END,
          "collectedAt" = CASE WHEN ${dto.status} = 'COLLECTED' THEN CURRENT_TIMESTAMP ELSE "collectedAt" END,
          "receivedById" = CASE WHEN ${dto.status} IN ('RECEIVED','IN_ANALYSIS','COMPLETED') THEN ${user.id} ELSE "receivedById" END,
          "receivedAt" = CASE WHEN ${dto.status} = 'RECEIVED' THEN CURRENT_TIMESTAMP ELSE "receivedAt" END,
          "rejectedAt" = CASE WHEN ${dto.status} = 'REJECTED' THEN CURRENT_TIMESTAMP ELSE "rejectedAt" END,
          "rejectionReason" = ${dto.rejectionReason?.trim() || null},
          "notes" = COALESCE(${dto.notes?.trim() || null}, "notes"),
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${id}
      `);
      if (dto.status === 'IN_ANALYSIS') {
        await transaction.examRequest.updateMany({
          where: { id: current.examRequestId, status: 'REQUESTED' },
          data: { status: 'IN_PROGRESS' },
        });
      }
    });
    await this.audit(user.id, 'LAB_SPECIMEN_STATUS_CHANGED', 'LabSpecimen', id, {
      previousStatus: current.status,
      status: dto.status,
      reason: dto.rejectionReason,
    });
    return (await this.specimens(undefined, current.patientId)).find((row) => row.id === id);
  }

  async createDischargeSummary(patientId: string, dto: CreateDischargeSummaryDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    if (!dto.consultationId && !dto.hospitalizationId) {
      throw new BadRequestException('Associez le résumé à une consultation ou à une hospitalisation.');
    }
    const id = randomUUID();
    const number = `SORT-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const signedAt = dto.signNow ? new Date() : null;
    const signatureHash = dto.signNow
      ? createHash('sha256')
          .update(JSON.stringify({ patientId, number, diagnoses: dto.diagnoses, recommendations: dto.recommendations, userId: user.id }))
          .digest('hex')
      : null;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "DischargeSummary" (
        "id", "number", "patientId", "consultationId", "hospitalizationId", "createdById",
        "admissionReason", "diagnoses", "examsPerformed", "treatmentsReceived", "dischargePrescription",
        "recommendations", "followUpInstructions", "warningSigns", "signedAt", "signatureHash", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${number}, ${patientId}, ${dto.consultationId ?? null}, ${dto.hospitalizationId ?? null}, ${user.id},
        ${dto.admissionReason.trim()}, ${dto.diagnoses.trim()}, ${dto.examsPerformed?.trim() || null},
        ${dto.treatmentsReceived?.trim() || null}, ${dto.dischargePrescription?.trim() || null},
        ${dto.recommendations.trim()}, ${dto.followUpInstructions?.trim() || null}, ${dto.warningSigns?.trim() || null},
        ${signedAt}, ${signatureHash}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    await this.audit(user.id, 'DISCHARGE_SUMMARY_CREATED', 'DischargeSummary', id, { patientId, number, signed: Boolean(signedAt) });
    return rows[0];
  }

  async dischargeSummaries(patientId: string) {
    await this.ensurePatient(patientId);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT s.*, u."username" AS "createdBy"
      FROM "DischargeSummary" s
      JOIN "User" u ON u."id" = s."createdById"
      WHERE s."patientId" = ${patientId}
      ORDER BY s."createdAt" DESC
    `);
  }

  async dischargeDocument(id: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        s.*, p."medicalRecordNumber", p."lastName", p."postName", p."firstName", p."dateOfBirth", p."sex",
        u."username" AS "createdBy", h."name" AS "hospitalName", h."legalName", h."address", h."logoDataUrl"
      FROM "DischargeSummary" s
      JOIN "Patient" p ON p."id" = s."patientId"
      JOIN "User" u ON u."id" = s."createdById"
      LEFT JOIN "HospitalProfile" h ON h."id" = 'main'
      WHERE s."id" = ${id}
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Résumé de sortie introuvable.');
    return rows[0];
  }

  bedBoard() {
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT
        r."id" AS "roomId", r."code" AS "roomCode", r."name" AS "roomName", r."service",
        b."id" AS "bedId", b."code" AS "bedCode", b."status" AS "bedStatus",
        h."id" AS "hospitalizationId", h."admittedAt", h."expectedDischargeAt",
        p."id" AS "patientId", p."medicalRecordNumber", p."lastName", p."postName", p."firstName",
        turnover."id" AS "turnoverId", turnover."status" AS "turnoverStatus", turnover."requestedAt", turnover."cleanedAt",
        CASE
          WHEN h."id" IS NOT NULL THEN 'OCCUPIED'
          WHEN turnover."status" = 'PENDING_CLEANING' THEN 'PENDING_CLEANING'
          WHEN turnover."status" = 'CLEANING' THEN 'CLEANING'
          WHEN b."status" = 'MAINTENANCE' THEN 'MAINTENANCE'
          ELSE 'AVAILABLE'
        END AS "operationalStatus"
      FROM "Room" r
      JOIN "Bed" b ON b."roomId" = r."id"
      LEFT JOIN "Hospitalization" h ON h."bedId" = b."id" AND h."status" = 'ACTIVE'
      LEFT JOIN "Patient" p ON p."id" = h."patientId"
      LEFT JOIN LATERAL (
        SELECT bt.* FROM "BedTurnover" bt WHERE bt."bedId" = b."id" ORDER BY bt."requestedAt" DESC LIMIT 1
      ) turnover ON true
      ORDER BY r."service", r."code", b."code"
    `);
  }

  async updateBedTurnover(id: string, dto: UpdateBedTurnoverDto, user: AuthenticatedUser) {
    const rows = await this.prisma.$queryRaw<Array<{ bedId: string; status: string }>>(Prisma.sql`
      SELECT "bedId", "status" FROM "BedTurnover" WHERE "id" = ${id} LIMIT 1
    `);
    const current = rows[0];
    if (!current) throw new NotFoundException('Cycle de préparation du lit introuvable.');
    if (current.status === 'READY') throw new BadRequestException('Ce lit est déjà disponible.');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "BedTurnover"
        SET "status" = ${dto.status},
            "cleanedById" = CASE WHEN ${dto.status} = 'READY' THEN ${user.id} ELSE "cleanedById" END,
            "cleanedAt" = CASE WHEN ${dto.status} = 'READY' THEN CURRENT_TIMESTAMP ELSE "cleanedAt" END,
            "notes" = COALESCE(${dto.notes?.trim() || null}, "notes")
        WHERE "id" = ${id}
      `);
      await transaction.bed.update({
        where: { id: current.bedId },
        data: { status: dto.status === 'READY' ? 'AVAILABLE' : 'MAINTENANCE' },
      });
    });
    await this.audit(user.id, 'BED_TURNOVER_UPDATED', 'BedTurnover', id, { status: dto.status });
    return { id, status: dto.status };
  }

  async createHandoff(patientId: string, dto: CreateNursingHandoffDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "NursingHandoff" (
        "id", "patientId", "hospitalizationId", "fromNurseId", "toNurseId", "diagnosis", "currentCondition",
        "treatmentsInProgress", "nextDoseAt", "pendingExams", "risks", "instructions", "createdAt"
      ) VALUES (
        ${id}, ${patientId}, ${dto.hospitalizationId ?? null}, ${user.id}, ${dto.toNurseId ?? null},
        ${dto.diagnosis?.trim() || null}, ${dto.currentCondition.trim()}, ${dto.treatmentsInProgress?.trim() || null},
        ${dto.nextDoseAt ? new Date(dto.nextDoseAt) : null}, ${dto.pendingExams?.trim() || null},
        ${dto.risks?.trim() || null}, ${dto.instructions.trim()}, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    if (dto.toNurseId && dto.toNurseId !== user.id) {
      const patient = await this.prisma.patient.findUniqueOrThrow({
        where: { id: patientId },
        select: { medicalRecordNumber: true },
      });
      await this.prisma.message.create({
        data: {
          senderId: user.id,
          receiverId: dto.toNurseId,
          content: `Relève infirmière à confirmer pour le dossier ${patient.medicalRecordNumber}.`,
        },
      });
    }
    await this.audit(user.id, 'NURSING_HANDOFF_CREATED', 'NursingHandoff', id, { patientId, toNurseId: dto.toNurseId });
    return rows[0];
  }

  async handoffs(user: AuthenticatedUser, patientId?: string) {
    const nurseOnly = hasAnyRole(user, [Role.NURSE]) && !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);
    const patientFilter = patientId ? Prisma.sql`AND h."patientId" = ${patientId}` : Prisma.empty;
    const userFilter = nurseOnly
      ? Prisma.sql`AND (h."fromNurseId" = ${user.id} OR h."toNurseId" = ${user.id} OR h."toNurseId" IS NULL)`
      : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT h.*, p."medicalRecordNumber", p."lastName", p."postName", p."firstName",
             sender."username" AS "fromNurse", receiver."username" AS "toNurse"
      FROM "NursingHandoff" h
      JOIN "Patient" p ON p."id" = h."patientId"
      JOIN "User" sender ON sender."id" = h."fromNurseId"
      LEFT JOIN "User" receiver ON receiver."id" = h."toNurseId"
      WHERE 1 = 1 ${patientFilter} ${userFilter}
      ORDER BY h."createdAt" DESC
      LIMIT 500
    `);
  }

  async acknowledgeHandoff(id: string, user: AuthenticatedUser) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "NursingHandoff"
      SET "toNurseId" = COALESCE("toNurseId", ${user.id}), "acknowledgedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id}
        AND "acknowledgedAt" IS NULL
        AND ("toNurseId" IS NULL OR "toNurseId" = ${user.id})
    `);
    if (!count) throw new ForbiddenException('Cette relève est déjà confirmée ou destinée à un autre infirmier.');
    await this.audit(user.id, 'NURSING_HANDOFF_ACKNOWLEDGED', 'NursingHandoff', id);
    return { id, acknowledged: true };
  }

  medicationAlerts(user: AuthenticatedUser) {
    const nurseOnly = hasAnyRole(user, [Role.NURSE]) && !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);
    const scope = nurseOnly
      ? Prisma.sql`AND (n."assignedNurseId" = ${user.id} OR n."assignedNurseId" IS NULL)`
      : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT n."id", n."patientId", n."label", n."medicationName", n."dose", n."route", n."scheduledAt", n."status",
             p."medicalRecordNumber", p."lastName", p."postName", p."firstName",
             GREATEST(0, EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - n."scheduledAt"))::integer / 60) AS "delayMinutes",
             CASE
               WHEN n."scheduledAt" > CURRENT_TIMESTAMP + INTERVAL '15 minutes' THEN 'UPCOMING'
               WHEN n."scheduledAt" > CURRENT_TIMESTAMP THEN 'DUE_SOON'
               WHEN n."scheduledAt" > CURRENT_TIMESTAMP - INTERVAL '15 minutes' THEN 'DUE_NOW'
               WHEN n."scheduledAt" > CURRENT_TIMESTAMP - INTERVAL '60 minutes' THEN 'LATE'
               ELSE 'CRITICAL_LATE'
             END AS "alertLevel"
      FROM "NursingCare" n
      JOIN "Patient" p ON p."id" = n."patientId"
      WHERE n."status" IN ('ORDERED','SCHEDULED','IN_PROGRESS')
        AND n."scheduledAt" <= CURRENT_TIMESTAMP + INTERVAL '60 minutes'
        ${scope}
      ORDER BY n."scheduledAt" ASC
    `);
  }

  async createFollowUp(patientId: string, dto: CreateFollowUpDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt <= new Date()) throw new BadRequestException('Le suivi doit être programmé dans le futur.');
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "FollowUpPlan" (
        "id", "patientId", "consultationId", "hospitalizationId", "createdById", "type", "scheduledAt",
        "notes", "reminderChannel", "reminderStatus", "createdAt"
      ) VALUES (
        ${id}, ${patientId}, ${dto.consultationId ?? null}, ${dto.hospitalizationId ?? null}, ${user.id},
        ${dto.type}, ${scheduledAt}, ${dto.notes?.trim() || null}, ${dto.reminderChannel ?? 'NONE'}, 'PENDING', CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    await this.audit(user.id, 'FOLLOW_UP_CREATED', 'FollowUpPlan', id, { patientId, type: dto.type, scheduledAt });
    return rows[0];
  }

  async followUps(patientId?: string, upcomingOnly = false) {
    const patientFilter = patientId ? Prisma.sql`AND f."patientId" = ${patientId}` : Prisma.empty;
    const upcomingFilter = upcomingOnly ? Prisma.sql`AND f."scheduledAt" >= CURRENT_TIMESTAMP AND f."completedAt" IS NULL` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT f.*, p."medicalRecordNumber", p."lastName", p."postName", p."firstName", u."username" AS "createdBy"
      FROM "FollowUpPlan" f
      JOIN "Patient" p ON p."id" = f."patientId"
      JOIN "User" u ON u."id" = f."createdById"
      WHERE 1 = 1 ${patientFilter} ${upcomingFilter}
      ORDER BY f."scheduledAt" ASC
      LIMIT 500
    `);
  }

  async completeFollowUp(id: string, user: AuthenticatedUser) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "FollowUpPlan" SET "completedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id} AND "completedAt" IS NULL
    `);
    if (!count) throw new NotFoundException('Suivi introuvable ou déjà terminé.');
    await this.audit(user.id, 'FOLLOW_UP_COMPLETED', 'FollowUpPlan', id);
    return { id, completed: true };
  }

  async createConsent(patientId: string, dto: CreateConsentDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const id = randomUUID();
    const number = `CNS-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const signatureHash = createHash('sha256')
      .update(JSON.stringify({ patientId, number, type: dto.type, signer: dto.signedByName.trim(), userId: user.id }))
      .digest('hex');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "PatientConsent" (
        "id", "number", "patientId", "professionalId", "type", "status", "signedByName", "relationship",
        "witnessName", "details", "signatureHash", "signedAt"
      ) VALUES (
        ${id}, ${number}, ${patientId}, ${user.id}, ${dto.type}, 'SIGNED', ${dto.signedByName.trim()},
        ${dto.relationship?.trim() || null}, ${dto.witnessName?.trim() || null}, ${dto.details?.trim() || null},
        ${signatureHash}, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    await this.audit(user.id, 'PATIENT_CONSENT_SIGNED', 'PatientConsent', id, { patientId, type: dto.type, number });
    return rows[0];
  }

  async consents(patientId: string) {
    await this.ensurePatient(patientId);
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT c.*, u."username" AS "professional"
      FROM "PatientConsent" c JOIN "User" u ON u."id" = c."professionalId"
      WHERE c."patientId" = ${patientId}
      ORDER BY c."signedAt" DESC
    `);
  }

  async revokeConsent(id: string, user: AuthenticatedUser) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "PatientConsent" SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" = 'SIGNED'
    `);
    if (!count) throw new NotFoundException('Consentement actif introuvable.');
    await this.audit(user.id, 'PATIENT_CONSENT_REVOKED', 'PatientConsent', id);
    return { id, revoked: true };
  }

  async createAmendment(patientId: string, dto: CreateAmendmentDto, user: AuthenticatedUser) {
    await this.ensurePatient(patientId);
    const id = randomUUID();
    const previousValue = JSON.stringify(dto.previousValue);
    const newValue = JSON.stringify(dto.newValue);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "RecordAmendment" (
        "id", "patientId", "entityType", "entityId", "requestedById", "reason", "previousValue", "newValue", "status", "createdAt"
      ) VALUES (
        ${id}, ${patientId}, ${dto.entityType.trim()}, ${dto.entityId.trim()}, ${user.id}, ${dto.reason.trim()},
        ${previousValue}::jsonb, ${newValue}::jsonb, 'PENDING', CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    await this.audit(user.id, 'RECORD_AMENDMENT_REQUESTED', dto.entityType, dto.entityId, { patientId, amendmentId: id });
    return rows[0];
  }

  amendments(patientId?: string, status?: string) {
    const patientFilter = patientId ? Prisma.sql`AND a."patientId" = ${patientId}` : Prisma.empty;
    const statusFilter = status ? Prisma.sql`AND a."status" = ${status}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a.*, p."medicalRecordNumber", p."lastName", p."postName", p."firstName",
             requester."username" AS "requestedBy", approver."username" AS "approvedBy"
      FROM "RecordAmendment" a
      JOIN "Patient" p ON p."id" = a."patientId"
      JOIN "User" requester ON requester."id" = a."requestedById"
      LEFT JOIN "User" approver ON approver."id" = a."approvedById"
      WHERE 1 = 1 ${patientFilter} ${statusFilter}
      ORDER BY a."createdAt" DESC
      LIMIT 500
    `);
  }

  async decideAmendment(id: string, dto: DecideAmendmentDto, user: AuthenticatedUser) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "RecordAmendment"
      SET "status" = ${dto.decision}, "approvedById" = ${user.id}, "decidedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "status" = 'PENDING'
    `);
    if (!count) throw new NotFoundException('Demande de correction en attente introuvable.');
    await this.audit(user.id, `RECORD_AMENDMENT_${dto.decision}`, 'RecordAmendment', id);
    return { id, status: dto.decision };
  }

  async patientSafetySummary(patientId: string) {
    const [alerts, triage, consents, followUps, dischargeSummaries] = await Promise.all([
      this.alerts(patientId),
      this.triageHistory(patientId),
      this.consents(patientId),
      this.followUps(patientId, true),
      this.dischargeSummaries(patientId),
    ]);
    return {
      alerts,
      latestTriage: triage[0] ?? null,
      consents,
      upcomingFollowUps: followUps,
      dischargeSummaries,
    };
  }

  private async ensurePatient(patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient actif introuvable.');
  }

  private async audit(
    userId: string,
    action: string,
    entity: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        metadata: metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
