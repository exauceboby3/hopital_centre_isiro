import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEquipmentDto,
  CreateIncidentDto,
  CreateMaintenanceDto,
  UpdateIncidentDto,
  UpdateMaintenanceDto,
} from './dto/clinical-safety.dto';

@Injectable()
export class QualityManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard() {
    const [waiting, doctorActivity, laboratory, medication, beds, deaths, receivables, graces, stock, noShows, incidents] =
      await Promise.all([
        this.prisma.$queryRaw<Array<{ averageMinutes: number; waitingCount: number }>>(Prisma.sql`
          SELECT
            COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - "journeyUpdatedAt")) / 60))::integer, 0) AS "averageMinutes",
            COUNT(*)::integer AS "waitingCount"
          FROM "Appointment"
          WHERE "status" = 'CHECKED_IN'
            AND "journeyStage" IN ('WAITING_DOCTOR','RETURN_TO_DOCTOR')
        `),
        this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          SELECT d."id" AS "doctorId", d."lastName", d."postName", d."firstName", d."specialty",
                 COUNT(c."id")::integer AS "patientCount"
          FROM "DoctorProfile" d
          LEFT JOIN "Consultation" c ON c."doctorId" = d."id" AND c."createdAt" >= CURRENT_DATE
          GROUP BY d."id", d."lastName", d."postName", d."firstName", d."specialty"
          ORDER BY "patientCount" DESC, d."lastName" ASC
        `),
        this.prisma.$queryRaw<Array<{ overdue: number; rejectedSpecimens: number; pendingValidation: number }>>(Prisma.sql`
          SELECT
            (SELECT COUNT(*)::integer FROM "ExamRequest"
              WHERE "status" IN ('REQUESTED','IN_PROGRESS','COMPLETED')
                AND "requestedAt" < CURRENT_TIMESTAMP - INTERVAL '2 hours') AS "overdue",
            (SELECT COUNT(*)::integer FROM "LabSpecimen" WHERE "status" = 'REJECTED') AS "rejectedSpecimens",
            (SELECT COUNT(*)::integer FROM "ExamRequest" WHERE "status" = 'COMPLETED') AS "pendingValidation"
        `),
        this.prisma.$queryRaw<Array<{ overdue: number; critical: number }>>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE "scheduledAt" < CURRENT_TIMESTAMP)::integer AS "overdue",
            COUNT(*) FILTER (WHERE "scheduledAt" < CURRENT_TIMESTAMP - INTERVAL '60 minutes')::integer AS "critical"
          FROM "NursingCare"
          WHERE "status" IN ('ORDERED','SCHEDULED','IN_PROGRESS')
        `),
        this.prisma.$queryRaw<Array<{ totalBeds: number; occupiedBeds: number; pendingCleaning: number; occupancyRate: number }>>(Prisma.sql`
          SELECT
            (SELECT COUNT(*)::integer FROM "Bed") AS "totalBeds",
            (SELECT COUNT(*)::integer FROM "Hospitalization" WHERE "status" = 'ACTIVE') AS "occupiedBeds",
            (SELECT COUNT(*)::integer FROM "BedTurnover" WHERE "status" IN ('PENDING_CLEANING','CLEANING')) AS "pendingCleaning",
            CASE WHEN (SELECT COUNT(*) FROM "Bed") = 0 THEN 0
                 ELSE ROUND((SELECT COUNT(*) FROM "Hospitalization" WHERE "status" = 'ACTIVE')::numeric * 100 /
                            (SELECT COUNT(*) FROM "Bed"))::integer END AS "occupancyRate"
        `),
        this.prisma.$queryRaw<Array<{ thirtyDays: number; today: number }>>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE "occurredAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days')::integer AS "thirtyDays",
            COUNT(*) FILTER (WHERE "occurredAt" >= CURRENT_DATE)::integer AS "today"
          FROM "DeathCase"
        `),
        this.prisma.$queryRaw<Array<{ amount: number; invoiceCount: number }>>(Prisma.sql`
          SELECT
            COALESCE(SUM(GREATEST(i."total" - COALESCE(pay.paid, 0) - COALESCE(ic."insurerAmount", 0) - COALESCE(vc."sponsorAmount", 0), 0)), 0)::float8 AS "amount",
            COUNT(*) FILTER (WHERE i."status" IN ('PENDING','PARTIALLY_PAID'))::integer AS "invoiceCount"
          FROM "Invoice" i
          LEFT JOIN (SELECT "invoiceId", SUM("amount") AS paid FROM "Payment" GROUP BY "invoiceId") pay ON pay."invoiceId" = i."id"
          LEFT JOIN "InsuranceCoverage" ic ON ic."invoiceId" = i."id" AND ic."status" IN ('GUARANTEED','SETTLED')
          LEFT JOIN "VoucherCoverage" vc ON vc."invoiceId" = i."id" AND vc."status" IN ('GUARANTEED','SETTLED')
          WHERE i."status" <> 'CANCELLED'
        `),
        this.prisma.$queryRaw<Array<{ active: number; expiringSoon: number }>>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE "status" = 'ACTIVE' AND ("validUntil" IS NULL OR "validUntil" > CURRENT_TIMESTAMP))::integer AS "active",
            COUNT(*) FILTER (WHERE "status" = 'ACTIVE' AND "validUntil" BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + INTERVAL '6 hours')::integer AS "expiringSoon"
          FROM "CareVoucher"
          WHERE "issuerName" = 'MESURE DE GRÂCE INTERNE'
        `),
        this.prisma.$queryRaw<Array<{ lowStock: number; outOfStock: number; expiringLots: number }>>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE "stockQuantity" > 0 AND "stockQuantity" <= "minimumStock")::integer AS "lowStock",
            COUNT(*) FILTER (WHERE "stockQuantity" <= 0)::integer AS "outOfStock",
            (SELECT COUNT(*)::integer FROM "MedicationBatch"
              WHERE "quantity" > 0 AND "expiresAt" <= CURRENT_TIMESTAMP + INTERVAL '90 days') AS "expiringLots"
          FROM "Medication" WHERE "isActive" = true
        `),
        this.prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
          SELECT COUNT(*)::integer AS "count" FROM "Appointment"
          WHERE "status" = 'NO_SHOW' AND "scheduledAt" >= CURRENT_DATE - INTERVAL '30 days'
        `),
        this.prisma.$queryRaw<Array<{ open: number; critical: number }>>(Prisma.sql`
          SELECT
            COUNT(*) FILTER (WHERE "status" <> 'CLOSED')::integer AS "open",
            COUNT(*) FILTER (WHERE "status" <> 'CLOSED' AND "severity" = 'CRITICAL')::integer AS "critical"
          FROM "ClinicalIncident"
        `),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      waiting: waiting[0] ?? { averageMinutes: 0, waitingCount: 0 },
      doctorActivity,
      laboratory: laboratory[0] ?? { overdue: 0, rejectedSpecimens: 0, pendingValidation: 0 },
      medication: medication[0] ?? { overdue: 0, critical: 0 },
      beds: beds[0] ?? { totalBeds: 0, occupiedBeds: 0, pendingCleaning: 0, occupancyRate: 0 },
      mortality: deaths[0] ?? { thirtyDays: 0, today: 0 },
      receivables: receivables[0] ?? { amount: 0, invoiceCount: 0 },
      graces: graces[0] ?? { active: 0, expiringSoon: 0 },
      stock: stock[0] ?? { lowStock: 0, outOfStock: 0, expiringLots: 0 },
      noShows: noShows[0]?.count ?? 0,
      incidents: incidents[0] ?? { open: 0, critical: 0 },
    };
  }

  async createIncident(dto: CreateIncidentDto, userId: string) {
    if (dto.patientId) {
      const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId }, select: { id: true } });
      if (!patient) throw new NotFoundException('Patient introuvable.');
    }
    const id = randomUUID();
    const reference = `INC-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ClinicalIncident" (
        "id", "reference", "patientId", "reportedById", "assignedToId", "category", "severity", "status",
        "description", "reportedAt"
      ) VALUES (
        ${id}, ${reference}, ${dto.patientId ?? null}, ${userId}, ${dto.assignedToId ?? null}, ${dto.category},
        ${dto.severity}, 'OPEN', ${dto.description.trim()}, CURRENT_TIMESTAMP
      ) RETURNING *
    `);
    await this.audit(userId, 'CLINICAL_INCIDENT_REPORTED', 'ClinicalIncident', id, { reference, severity: dto.severity });
    return rows[0];
  }

  incidents(status?: string, severity?: string) {
    const statusFilter = status ? Prisma.sql`AND i."status" = ${status}` : Prisma.empty;
    const severityFilter = severity ? Prisma.sql`AND i."severity" = ${severity}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT i.*, reporter."username" AS "reportedBy", assignee."username" AS "assignedTo",
             p."medicalRecordNumber", p."lastName", p."postName", p."firstName"
      FROM "ClinicalIncident" i
      JOIN "User" reporter ON reporter."id" = i."reportedById"
      LEFT JOIN "User" assignee ON assignee."id" = i."assignedToId"
      LEFT JOIN "Patient" p ON p."id" = i."patientId"
      WHERE 1 = 1 ${statusFilter} ${severityFilter}
      ORDER BY
        CASE i."severity" WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
        i."reportedAt" DESC
      LIMIT 1000
    `);
  }

  async updateIncident(id: string, dto: UpdateIncidentDto, userId: string) {
    if (dto.status === 'CLOSED' && (!dto.rootCause?.trim() || !dto.correctiveAction?.trim())) {
      throw new BadRequestException('La cause racine et l’action corrective sont obligatoires pour clôturer.');
    }
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ClinicalIncident"
      SET "status" = ${dto.status},
          "assignedToId" = COALESCE(${dto.assignedToId ?? null}, "assignedToId"),
          "rootCause" = COALESCE(${dto.rootCause?.trim() || null}, "rootCause"),
          "correctiveAction" = COALESCE(${dto.correctiveAction?.trim() || null}, "correctiveAction"),
          "closedAt" = CASE WHEN ${dto.status} = 'CLOSED' THEN CURRENT_TIMESTAMP ELSE NULL END
      WHERE "id" = ${id}
    `);
    if (!count) throw new NotFoundException('Incident introuvable.');
    await this.audit(userId, 'CLINICAL_INCIDENT_UPDATED', 'ClinicalIncident', id, { status: dto.status });
    return { id, status: dto.status };
  }

  async createEquipment(dto: CreateEquipmentDto, userId: string) {
    const id = randomUUID();
    try {
      const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "BiomedicalEquipment" (
          "id", "code", "name", "serialNumber", "department", "status", "acquiredAt", "nextMaintenanceAt",
          "assignedTechnicianId", "notes", "createdAt", "updatedAt"
        ) VALUES (
          ${id}, ${dto.code.trim().toUpperCase()}, ${dto.name.trim()}, ${dto.serialNumber?.trim() || null},
          ${dto.department.trim()}, 'ACTIVE', ${dto.acquiredAt ? new Date(dto.acquiredAt) : null},
          ${dto.nextMaintenanceAt ? new Date(dto.nextMaintenanceAt) : null}, ${dto.assignedTechnicianId ?? null},
          ${dto.notes?.trim() || null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        ) RETURNING *
      `);
      await this.audit(userId, 'BIOMEDICAL_EQUIPMENT_CREATED', 'BiomedicalEquipment', id, { code: dto.code });
      return rows[0];
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('Le code ou le numéro de série de cet équipement existe déjà.');
      }
      throw error;
    }
  }

  equipment(status?: string, department?: string) {
    const statusFilter = status ? Prisma.sql`AND e."status" = ${status}` : Prisma.empty;
    const departmentFilter = department ? Prisma.sql`AND e."department" = ${department}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT e.*, technician."username" AS "assignedTechnician",
             COALESCE(open_maintenance."openCount", 0)::integer AS "openMaintenanceCount"
      FROM "BiomedicalEquipment" e
      LEFT JOIN "User" technician ON technician."id" = e."assignedTechnicianId"
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS "openCount" FROM "EquipmentMaintenance" m
        WHERE m."equipmentId" = e."id" AND m."status" IN ('OPEN','IN_PROGRESS')
      ) open_maintenance ON true
      WHERE 1 = 1 ${statusFilter} ${departmentFilter}
      ORDER BY
        CASE
          WHEN e."status" = 'OUT_OF_SERVICE' THEN 1
          WHEN e."nextMaintenanceAt" IS NOT NULL AND e."nextMaintenanceAt" <= CURRENT_TIMESTAMP THEN 2
          WHEN e."status" = 'MAINTENANCE' THEN 3
          ELSE 4
        END,
        e."department", e."name"
    `);
  }

  async createMaintenance(equipmentId: string, dto: CreateMaintenanceDto, userId: string) {
    const equipment = await this.prisma.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
      SELECT "id", "status" FROM "BiomedicalEquipment" WHERE "id" = ${equipmentId} LIMIT 1
    `);
    if (!equipment[0]) throw new NotFoundException('Équipement introuvable.');
    const id = randomUUID();
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "EquipmentMaintenance" (
        "id", "equipmentId", "reportedById", "technicianId", "type", "status", "description", "cost", "reportedAt", "notes"
      ) VALUES (
        ${id}, ${equipmentId}, ${userId}, ${dto.technicianId ?? null}, ${dto.type}, 'OPEN', ${dto.description.trim()},
        ${dto.cost ?? null}, CURRENT_TIMESTAMP, ${dto.notes?.trim() || null}
      ) RETURNING *
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "BiomedicalEquipment" SET "status" = 'MAINTENANCE', "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = ${equipmentId}
    `);
    await this.audit(userId, 'EQUIPMENT_MAINTENANCE_OPENED', 'EquipmentMaintenance', id, { equipmentId, type: dto.type });
    return rows[0];
  }

  maintenance(equipmentId?: string, status?: string) {
    const equipmentFilter = equipmentId ? Prisma.sql`AND m."equipmentId" = ${equipmentId}` : Prisma.empty;
    const statusFilter = status ? Prisma.sql`AND m."status" = ${status}` : Prisma.empty;
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT m.*, e."code" AS "equipmentCode", e."name" AS "equipmentName", e."department",
             reporter."username" AS "reportedBy", technician."username" AS "technician"
      FROM "EquipmentMaintenance" m
      JOIN "BiomedicalEquipment" e ON e."id" = m."equipmentId"
      JOIN "User" reporter ON reporter."id" = m."reportedById"
      LEFT JOIN "User" technician ON technician."id" = m."technicianId"
      WHERE 1 = 1 ${equipmentFilter} ${statusFilter}
      ORDER BY m."reportedAt" DESC
      LIMIT 1000
    `);
  }

  async updateMaintenance(id: string, dto: UpdateMaintenanceDto, userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ equipmentId: string }>>(Prisma.sql`
      SELECT "equipmentId" FROM "EquipmentMaintenance" WHERE "id" = ${id} LIMIT 1
    `);
    const current = rows[0];
    if (!current) throw new NotFoundException('Maintenance introuvable.');

    await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE "EquipmentMaintenance"
        SET "status" = ${dto.status},
            "technicianId" = COALESCE(${dto.technicianId ?? null}, "technicianId"),
            "cost" = COALESCE(${dto.cost ?? null}, "cost"),
            "notes" = COALESCE(${dto.notes?.trim() || null}, "notes"),
            "startedAt" = CASE WHEN ${dto.status} = 'IN_PROGRESS' AND "startedAt" IS NULL THEN CURRENT_TIMESTAMP ELSE "startedAt" END,
            "completedAt" = CASE WHEN ${dto.status} = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END
        WHERE "id" = ${id}
      `);
      if (dto.status === 'COMPLETED') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "BiomedicalEquipment"
          SET "status" = 'ACTIVE', "lastMaintenanceAt" = CURRENT_TIMESTAMP,
              "nextMaintenanceAt" = COALESCE("nextMaintenanceAt", CURRENT_TIMESTAMP + INTERVAL '6 months'),
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${current.equipmentId}
        `);
      } else if (dto.status === 'CANCELLED') {
        await transaction.$executeRaw(Prisma.sql`
          UPDATE "BiomedicalEquipment" SET "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${current.equipmentId}
        `);
      }
    });
    await this.audit(userId, 'EQUIPMENT_MAINTENANCE_UPDATED', 'EquipmentMaintenance', id, { status: dto.status });
    return { id, status: dto.status };
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
