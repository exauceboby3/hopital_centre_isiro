import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthenticatedUser } from '../common/authenticated-user';
import {
  hospitalDayRange,
  OPERATIONAL_CYCLE_MARKER_QUERY,
  OPERATIONAL_CYCLE_RESET_ACTION,
} from '../common/hospital-time';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect } from '../users/users.service';
import {
  CleanupAuditLogsDto,
  CreateAdministrativeUserDto,
  ListAuditLogsDto,
  PurgeOperationalDataDto,
  ResetOperationalCycleDto,
  UpdateManagedUserDto,
} from './dto/admin.dto';
import { canManagePrivilegedRole, wouldRemoveLastSuperAdmin } from './admin.rules';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: AuthenticatedUser) {
    const { start } = hospitalDayRange();
    const cycleMarker =
      actor.role === Role.SUPER_ADMIN
        ? await this.prisma.auditLog.findFirst(OPERATIONAL_CYCLE_MARKER_QUERY)
        : null;
    const auditStartedAt =
      cycleMarker?.createdAt && cycleMarker.createdAt > start ? cycleMarker.createdAt : start;
    const visibleUsers = actor.role === Role.SUPER_ADMIN ? {} : { role: { not: Role.SUPER_ADMIN } };
    const [users, activeUsers, services, alerts, auditToday, pendingInvoices, pendingRevenue] =
      await Promise.all([
        this.prisma.user.count({ where: visibleUsers }),
        this.prisma.user.count({ where: { ...visibleUsers, isActive: true } }),
        this.prisma.billableService.count({ where: { isActive: true } }),
        this.prisma.emergencyAlert.count({ where: { status: 'ACTIVE' } }),
        actor.role === Role.SUPER_ADMIN
          ? this.prisma.auditLog.count({
              where: {
                createdAt:
                  auditStartedAt === cycleMarker?.createdAt
                    ? { gt: auditStartedAt }
                    : { gte: auditStartedAt },
              },
            })
          : Promise.resolve(0),
        this.prisma.invoice.count({
          where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID] } },
        }),
        this.prisma.invoice.aggregate({
          where: { status: { in: [InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID] } },
          _sum: { total: true },
        }),
      ]);
    return {
      users,
      activeUsers,
      services,
      activeAlerts: alerts,
      auditToday,
      pendingInvoices,
      pendingRevenue: Number(pendingRevenue._sum.total ?? 0),
    };
  }

  listUsers(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: actor.role === Role.SUPER_ADMIN ? {} : { role: { not: Role.SUPER_ADMIN } },
      select: publicUserSelect,
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
  }

  async createAdministrativeUser(dto: CreateAdministrativeUserDto) {
    if (dto.role !== Role.ADMIN && dto.role !== Role.SUPER_ADMIN) {
      throw new BadRequestException('Seuls les comptes administratifs sont acceptés ici.');
    }
    const username = dto.username.trim();
    await this.assertUsernameAvailable(username);
    if (dto.role === Role.ADMIN && (!dto.lastName?.trim() || !dto.specialty?.trim())) {
      throw new BadRequestException(
        'Le nom et la spécialité médicale sont obligatoires pour un administrateur.',
      );
    }
    try {
      const userId = await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: {
            username,
            passwordHash: await argon2.hash(dto.password),
            role: dto.role,
            additionalRoles: dto.role === Role.ADMIN ? [Role.DOCTOR] : [],
          },
        });
        if (dto.role === Role.ADMIN) {
          await transaction.doctorProfile.create({
            data: {
              userId: user.id,
              lastName: dto.lastName!.trim(),
              postName: dto.postName?.trim(),
              firstName: dto.firstName?.trim(),
              specialty: dto.specialty!.trim(),
              grade: dto.grade?.trim(),
              licenseNumber: dto.licenseNumber?.trim().toUpperCase(),
              phone: dto.phone?.trim(),
              address: dto.address?.trim(),
            },
          });
        }
        return user.id;
      });
      return this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: publicUserSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException("Ce nom d'utilisateur existe déjà.");
      }
      throw error;
    }
  }

  async updateUser(id: string, dto: UpdateManagedUserDto, actor: AuthenticatedUser) {
    const target = await this.findUser(id);
    this.assertCanManage(target.role, dto.role, actor.role);
    if (id === actor.id && dto.isActive === false) {
      throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte.');
    }
    await this.assertLastSuperAdmin(target.role, dto.role, dto.isActive);
    const username = dto.username?.trim();
    if (username !== undefined) await this.assertUsernameAvailable(username, id);

    const nextPrimaryRole = dto.role ?? target.role;
    const additionalRoles = this.normalizeAdditionalRoles(
      nextPrimaryRole,
      dto.additionalRoles ?? target.additionalRoles,
    );
    const hasDoctorProfile = await this.prisma.doctorProfile.count({ where: { userId: id } });
    if (additionalRoles.includes(Role.DOCTOR) && target.role !== Role.DOCTOR && !hasDoctorProfile) {
      if (nextPrimaryRole !== Role.ADMIN) {
        throw new BadRequestException(
          "Le rôle supplémentaire Médecin nécessite d'abord un profil médical complet.",
        );
      }
    }

    const passwordHash = dto.password ? await argon2.hash(dto.password) : undefined;
    const updated = await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          username,
          role: dto.role,
          additionalRoles,
          isActive: dto.isActive,
          passwordHash,
        },
        select: publicUserSelect,
      });
      if (nextPrimaryRole === Role.ADMIN && !hasDoctorProfile) {
        await transaction.doctorProfile.create({
          data: {
            userId: id,
            lastName: username || target.username,
            specialty: 'Médecine générale',
          },
        });
      }
      if (dto.isActive === false || passwordHash) {
        await transaction.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return user;
    });
    return updated;
  }

  async deactivateUser(id: string, actor: AuthenticatedUser) {
    return this.updateUser(id, { isActive: false }, actor);
  }

  async listAuditLogs(filters: ListAuditLogsDto, page = 1, limit = 50) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    const safePage = Math.max(page, 1);
    const where: Prisma.AuditLogWhereInput = {
      ...(filters.entity ? { entity: { contains: filters.entity, mode: 'insensitive' } } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: new Date(filters.from) } : {}),
              ...(filters.to ? { lte: new Date(filters.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, username: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  async cleanupAuditLogs(dto: CleanupAuditLogsDto) {
    const before = new Date(dto.before);
    if (before >= new Date()) {
      throw new BadRequestException('La date de nettoyage doit être antérieure à maintenant.');
    }
    const [deleted, idempotency] = await Promise.all([
      this.prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: before },
          action: { not: OPERATIONAL_CYCLE_RESET_ACTION },
        },
      }),
      this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
    ]);
    return { deleted: deleted.count, expiredIdempotencyKeys: idempotency.count, before };
  }

  async resetOperationalCycle(dto: ResetOperationalCycleDto, actor: AuthenticatedUser) {
    if (dto.confirmation !== 'REINITIALISER') {
      throw new BadRequestException('La confirmation de réinitialisation est incorrecte.');
    }
    const marker = await this.prisma.auditLog.create({
      data: {
        userId: actor.id,
        action: OPERATIONAL_CYCLE_RESET_ACTION,
        entity: 'operational-cycle',
        metadata: {
          preservedData: true,
          counters: [
            'patients',
            'appointments',
            'consultations',
            'laboratory',
            'hospitalizations',
            'patientJourneys',
          ],
          message: 'Début d’un nouveau cycle opérationnel',
        },
      },
      select: { id: true, createdAt: true },
    });
    return {
      cycleStartedAt: marker.createdAt,
      preservedData: true,
    };
  }

  async purgeOperationalData(dto: PurgeOperationalDataDto, actor: AuthenticatedUser) {
    if (dto.confirmation !== 'EFFACER TOUTES LES ACTIVITES') {
      throw new BadRequestException('La confirmation de suppression est incorrecte.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const preserved = await Promise.all([
        transaction.patient.count(),
        transaction.user.count(),
        transaction.medication.count(),
        transaction.billableService.count(),
      ]);

      await transaction.$executeRawUnsafe(`
        TRUNCATE TABLE
          "PatientArchiveEvent", "Appointment", "Consultation", "VitalSign", "ExamRequest",
          "LabExamDocument", "Hospitalization", "Invoice", "InvoiceItem", "Payment",
          "CashClosure", "StockMovement", "Message", "MessageAttachment", "AuditLog",
          "EmergencyAlert", "EmergencyAlertComment", "CareAuthorization", "CustomFieldValue",
          "ClinicalOrder", "BloodUnit", "BloodTransfusion", "PatientInsurance",
          "InsuranceClaim", "InsuranceCoverage", "CareVoucher", "VoucherCoverage",
          "PurchaseOrder", "PurchaseOrderItem", "NursingCare", "Prescription",
          "PrescriptionItem", "MedicationBatch", "InventoryCount", "InventoryCountLine",
          "SpecialtyCase", "RadiologyStudy", "DicomInstance", "StaffShift",
          "AttendanceRecord", "PayrollPeriod", "PayrollEntry", "JournalEntry", "JournalLine",
          "UtilityBill", "IdempotencyRecord", "PatientClinicalAmendment", "DepartmentStock",
          "DepartmentStockMovement", "DepartmentDailyReport", "DepartmentDailyReportItem",
          "InternalRequisition", "InternalRequisitionItem", "BackupRun", "BedTurnover",
          "BreakGlassAccess", "ClinicalIncident", "DeathCase", "DischargeSummary",
          "FollowUpPlan", "IdentityVerification", "LabAdditionalExamDecision", "LabSpecimen",
          "LoginSecurityEvent", "MedicationAdministrationEvent", "NursingHandoff",
          "OfflineSyncConflict", "PatientAdvance", "PatientAdvanceAllocation",
          "PatientClinicalAlert", "PatientConsent", "PatientEpisode", "PaymentInstallment",
          "PaymentPlan", "RecordAmendment", "TriageAssessment", "EquipmentMaintenance"
        RESTART IDENTITY CASCADE
      `);

      await Promise.all([
        transaction.medication.updateMany({ data: { stockQuantity: 0 } }),
        transaction.bed.updateMany({ data: { status: 'AVAILABLE' } }),
      ]);

      const marker = await transaction.auditLog.create({
        data: {
          userId: actor.id,
          action: OPERATIONAL_CYCLE_RESET_ACTION,
          entity: 'operational-data',
          metadata: {
            preservedData: false,
            preservedPatients: preserved[0],
            preservedUsers: preserved[1],
            preservedMedications: preserved[2],
            preservedBillableServices: preserved[3],
            medicationStockReset: true,
            message: 'Purge complète des activités avec conservation des référentiels',
          },
        },
        select: { id: true, createdAt: true },
      });

      return {
        cycleStartedAt: marker.createdAt,
        preserved: {
          patients: preserved[0],
          users: preserved[1],
          medications: preserved[2],
          billableServices: preserved[3],
        },
      };
    });
  }

  private async findUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return user;
  }

  private async assertUsernameAvailable(username: string, excludeId?: string) {
    if (username.length < 3) {
      throw new BadRequestException("Le nom d'utilisateur doit contenir au moins 3 caractères.");
    }
    const existing = await this.prisma.user.findFirst({
      where: {
        username: { equals: username, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "Ce nom d'utilisateur existe déjà, même avec une casse différente.",
      );
    }
  }

  private assertCanManage(targetRole: Role, nextRole: Role | undefined, actorRole: Role) {
    if (!canManagePrivilegedRole(actorRole, targetRole, nextRole)) {
      throw new ForbiddenException('Seul le super-administrateur gère les super-administrateurs.');
    }
  }

  private normalizeAdditionalRoles(primaryRole: Role, roles: Role[]): Role[] {
    const normalized = [...new Set(roles)].filter((role) => role !== primaryRole);
    if (normalized.some((role) => role === Role.SUPER_ADMIN || role === Role.ADMIN)) {
      throw new BadRequestException(
        'Administrateur et super-administrateur doivent rester des rôles principaux.',
      );
    }
    if (primaryRole === Role.ADMIN && !normalized.includes(Role.DOCTOR)) {
      normalized.push(Role.DOCTOR);
    }
    return normalized;
  }

  private async assertLastSuperAdmin(currentRole: Role, nextRole?: Role, nextActive?: boolean) {
    if (currentRole === Role.SUPER_ADMIN) {
      const activeSupers = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, isActive: true },
      });
      if (wouldRemoveLastSuperAdmin(currentRole, nextRole, nextActive, activeSupers)) {
        throw new BadRequestException('Le dernier super-administrateur actif doit être conservé.');
      }
    }
  }
}
