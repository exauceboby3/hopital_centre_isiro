import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';

interface LedgerRow {
  id: string;
  nursingCareId: string;
  patientId: string;
  nurseId: string;
  status: 'ADMINISTERED' | 'REFUSED' | 'OMITTED' | 'MISSED';
  scheduledAt: Date;
  performedAt: Date;
  prescribedDose: string | null;
  administeredDose: string | null;
  route: string | null;
  omissionReason: string | null;
  comment: string | null;
  adverseReaction: string | null;
  patientBarcode: string | null;
  medicationBarcode: string | null;
  signatureHash: string;
  medicalRecordNumber: string;
  lastName: string;
  postName: string | null;
  firstName: string | null;
  medicationName: string | null;
  careLabel: string;
  nurseUsername: string;
}

@Injectable()
export class MedicationAdministrationLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthenticatedUser, patientId?: string, from?: string, to?: string) {
    const nurseOnly =
      hasAnyRole(user, [Role.NURSE]) &&
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    return this.prisma.$queryRaw<LedgerRow[]>(Prisma.sql`
      SELECT
        event.*,
        patient."medicalRecordNumber",
        patient."lastName",
        patient."postName",
        patient."firstName",
        care."medicationName",
        care."label" AS "careLabel",
        nurse."username" AS "nurseUsername"
      FROM "MedicationAdministrationEvent" event
      INNER JOIN "Patient" patient ON patient."id" = event."patientId"
      INNER JOIN "NursingCare" care ON care."id" = event."nursingCareId"
      INNER JOIN "User" nurse ON nurse."id" = event."nurseId"
      WHERE (${patientId ?? null}::TEXT IS NULL OR event."patientId" = ${patientId ?? null})
        AND (${fromDate}::TIMESTAMP IS NULL OR event."performedAt" >= ${fromDate})
        AND (${toDate}::TIMESTAMP IS NULL OR event."performedAt" <= ${toDate})
        AND (${nurseOnly} = FALSE OR event."nurseId" = ${user.id})
      ORDER BY event."performedAt" DESC
      LIMIT 1000
    `);
  }
}
