import { ForbiddenException, Injectable } from '@nestjs/common';
import { BillableServiceType, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { ListPatientsDto } from './dto/list-patients.dto';

interface BreakGlassPatientRow {
  patientId: string;
}

@Injectable()
export class PatientAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPatientsDto, user: AuthenticatedUser, compact = false) {
    const search = query.search?.trim();
    const breakGlassPatientIds = await this.activeBreakGlassPatientIds(user.id);
    const normalScope = this.scopeFor(user);
    const accessScope: Prisma.PatientWhereInput = breakGlassPatientIds.length
      ? { OR: [normalScope, { id: { in: breakGlassPatientIds } }] }
      : normalScope;
    const where: Prisma.PatientWhereInput = {
      archivedAt: null,
      ...(query.sex ? { sex: query.sex } : {}),
      ...accessScope,
      ...(search
        ? {
            OR: [
              { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { postName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      compact
        ? this.prisma.patient.findMany({
            where,
            select: {
              id: true,
              medicalRecordNumber: true,
              lastName: true,
              postName: true,
              firstName: true,
              sex: true,
              phone: true,
              createdAt: true,
            },
            skip,
            take: query.limit,
            orderBy: { medicalRecordNumber: 'asc' },
          })
        : this.prisma.patient.findMany({
            where,
            omit: { identityKey: true },
            skip,
            take: query.limit,
            orderBy: [{ lastName: 'asc' }, { createdAt: 'desc' }],
          }),
      this.prisma.patient.count({ where }),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async assertCanAccess(patientId: string, user: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null, ...this.scopeFor(user) },
      select: { id: true },
    });
    if (patient) return;

    const breakGlass = await this.prisma.$queryRaw<BreakGlassPatientRow[]>(Prisma.sql`
      SELECT "patientId" FROM "BreakGlassAccess"
      WHERE "patientId" = ${patientId} AND "userId" = ${user.id}
        AND "revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
      LIMIT 1
    `);
    if (breakGlass.length > 0) {
      const activePatient = await this.prisma.patient.count({
        where: { id: patientId, archivedAt: null },
      });
      if (activePatient) return;
    }

    throw new ForbiddenException(
      'Ce patient ne vous est pas affecté ou ne relève pas de votre service. En urgence vitale, ouvrez un bris de glace motivé et temporaire.',
    );
  }

  private async activeBreakGlassPatientIds(userId: string) {
    const rows = await this.prisma.$queryRaw<BreakGlassPatientRow[]>(Prisma.sql`
      SELECT DISTINCT "patientId" FROM "BreakGlassAccess"
      WHERE "userId" = ${userId} AND "revokedAt" IS NULL
        AND "expiresAt" > CURRENT_TIMESTAMP
    `);
    return rows.map((row) => row.patientId);
  }

  private scopeFor(user: AuthenticatedUser): Prisma.PatientWhereInput {
    if (
      hasAnyRole(user, [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.RECEPTIONIST,
        Role.SECRETARY,
        Role.CASHIER,
        Role.ACCOUNTANT,
        Role.PHARMACIST,
        Role.STOREKEEPER,
      ])
    ) {
      return {};
    }

    if (hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])) {
      // Les praticiens peuvent consulter tous les dossiers actifs.
      // Les écritures sont tracées par les services cliniques dédiés.
      return {};
    }

    if (hasAnyRole(user, [Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST])) {
      return {
        examRequests: {
          some: {
            OR: [
              { performedByLabTech: { userId: user.id } },
              { validatedByLabTech: { userId: user.id } },
              {
                careAuthorization: {
                  service: { type: BillableServiceType.LABORATORY },
                },
              },
            ],
          },
        },
      };
    }

    if (hasAnyRole(user, [Role.RADIOLOGIST])) {
      return {
        OR: [
          { radiologyStudies: { some: { performedById: user.id } } },
          { clinicalOrders: { some: { type: BillableServiceType.RADIOLOGY } } },
        ],
      };
    }

    if (hasAnyRole(user, [Role.NURSE])) {
      return {
        OR: [
          { hospitalizations: { some: { status: 'ACTIVE' } } },
          { nursingCare: { some: { assignedNurseId: user.id } } },
          { appointments: { some: { status: 'CHECKED_IN' } } },
        ],
      };
    }

    return { id: '__NO_PATIENT_ACCESS__' };
  }
}
