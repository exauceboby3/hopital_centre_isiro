import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillableServiceType,
  EmergencySeverity,
  NursingCareStatus,
  NursingCareType,
  Prisma,
  Role,
} from '@prisma/client';
import { PatientFinancialAccessService } from '../billing/patient-financial-access.service';
import { ClinicalGovernanceService } from '../clinical-governance/clinical-governance.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNursingCareDto, CreateWardRoundDto, UpdateNursingCareDto } from './dto/nursing.dto';

const nursingInclude = {
  patient: true,
  consultation: true,
  hospitalization: { include: { bed: { include: { room: true } } } },
  orderedBy: { select: { id: true, username: true, role: true } },
  assignedNurse: { select: { id: true, username: true, role: true, additionalRoles: true } },
  performedBy: { select: { id: true, username: true, role: true } },
} satisfies Prisma.NursingCareInclude;

const transitions: Record<NursingCareStatus, NursingCareStatus[]> = {
  ORDERED: [
    NursingCareStatus.SCHEDULED,
    NursingCareStatus.IN_PROGRESS,
    NursingCareStatus.COMPLETED,
    NursingCareStatus.CANCELLED,
  ],
  SCHEDULED: [
    NursingCareStatus.IN_PROGRESS,
    NursingCareStatus.COMPLETED,
    NursingCareStatus.MISSED,
    NursingCareStatus.CANCELLED,
  ],
  IN_PROGRESS: [NursingCareStatus.COMPLETED, NursingCareStatus.CANCELLED],
  COMPLETED: [],
  MISSED: [NursingCareStatus.SCHEDULED, NursingCareStatus.CANCELLED],
  CANCELLED: [],
};

const medicationCareTypes: NursingCareType[] = [
  NursingCareType.INJECTION,
  NursingCareType.INFUSION,
  NursingCareType.MEDICATION,
];

@Injectable()
export class NursingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financialAccess: PatientFinancialAccessService,
    private readonly governance: ClinicalGovernanceService,
  ) {}

  list(
    user: AuthenticatedUser,
    patientId?: string,
    status?: NursingCareStatus,
    from?: string,
    to?: string,
  ) {
    const nurseOnly =
      hasAnyRole(user, [Role.NURSE]) &&
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    return this.prisma.nursingCare.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...(status ? { status } : {}),
        ...(nurseOnly ? { OR: [{ assignedNurseId: user.id }, { assignedNurseId: null }] } : {}),
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: nursingInclude,
      orderBy: [{ status: 'asc' }, { scheduledAt: 'asc' }],
      take: 500,
    });
  }

  async create(dto: CreateNursingCareDto, user: AuthenticatedUser) {
    await this.financialAccess.assertCareAccess(dto.patientId, BillableServiceType.PROCEDURE);
    if (
      medicationCareTypes.includes(dto.type) &&
      (!dto.medicationName || !dto.dose || !dto.route)
    ) {
      throw new BadRequestException(
        'Le médicament, la dose et la voie sont obligatoires pour ce soin.',
      );
    }
    const [patient, consultation, hospitalization] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: dto.patientId, archivedAt: null } }),
      dto.consultationId
        ? this.prisma.consultation.findUnique({ where: { id: dto.consultationId } })
        : null,
      dto.hospitalizationId
        ? this.prisma.hospitalization.findUnique({ where: { id: dto.hospitalizationId } })
        : null,
    ]);
    if (!patient) throw new NotFoundException('Patient actif introuvable.');
    if (dto.consultationId && !consultation) {
      throw new NotFoundException('Consultation associée introuvable.');
    }
    if (consultation && consultation.patientId !== dto.patientId) {
      throw new BadRequestException('La consultation sélectionnée appartient à un autre patient.');
    }
    if (dto.hospitalizationId && !hospitalization) {
      throw new NotFoundException('Hospitalisation associée introuvable.');
    }
    if (hospitalization && hospitalization.patientId !== dto.patientId) {
      throw new BadRequestException(
        "L'hospitalisation sélectionnée appartient à un autre patient.",
      );
    }
    await this.assertNurse(dto.assignedNurseId);
    const { frequencyHours, durationDays, ...careData } = dto;
    if ((frequencyHours && !durationDays) || (!frequencyHours && durationDays)) {
      throw new BadRequestException('La fréquence et la durée doivent être renseignées ensemble.');
    }
    const occurrenceCount =
      frequencyHours && durationDays ? Math.floor((durationDays * 24 - 1) / frequencyHours) + 1 : 1;
    if (occurrenceCount > 500) {
      throw new BadRequestException('Le programme ne peut pas dépasser 500 administrations.');
    }
    return this.prisma.$transaction(async (transaction) => {
      const firstScheduledAt = new Date(dto.scheduledAt);
      const created = [];
      for (let index = 0; index < occurrenceCount; index += 1) {
        const care = await transaction.nursingCare.create({
          data: {
            ...careData,
            label: dto.label.trim(),
            scheduledAt: new Date(
              firstScheduledAt.getTime() + index * (frequencyHours ?? 0) * 60 * 60 * 1000,
            ),
            orderedById: user.id,
            status: dto.assignedNurseId ? NursingCareStatus.SCHEDULED : NursingCareStatus.ORDERED,
          },
        });
        created.push(care);
      }
      if (dto.assignedNurseId && dto.assignedNurseId !== user.id) {
        const patientRow = await transaction.patient.findUniqueOrThrow({
          where: { id: dto.patientId },
          select: { medicalRecordNumber: true, lastName: true, postName: true, firstName: true },
        });
        const name = [patientRow.lastName, patientRow.postName, patientRow.firstName]
          .filter(Boolean)
          .join(' ');
        await transaction.message.create({
          data: {
            senderId: user.id,
            receiverId: dto.assignedNurseId,
            content: `Nouveau soin attribué : ${dto.label} pour ${name} (${patientRow.medicalRecordNumber}), prévu le ${new Date(dto.scheduledAt).toLocaleString('fr-FR')}.`,
          },
        });
      } else if (!dto.assignedNurseId) {
        const [patientRow, nurses] = await Promise.all([
          transaction.patient.findUniqueOrThrow({
            where: { id: dto.patientId },
            select: { medicalRecordNumber: true },
          }),
          transaction.user.findMany({
            where: {
              isActive: true,
              OR: [{ role: Role.NURSE }, { additionalRoles: { has: Role.NURSE } }],
              id: { not: user.id },
            },
            select: { id: true },
          }),
        ]);
        if (nurses.length > 0) {
          await transaction.message.createMany({
            data: nurses.map((nurse) => ({
              senderId: user.id,
              receiverId: nurse.id,
              content: `Nouveau soin disponible : ${dto.label} pour le dossier ${patientRow.medicalRecordNumber}. Le premier infirmier disponible peut le prendre en charge.`,
            })),
          });
        }
      }
      return transaction.nursingCare.findMany({
        where: { id: { in: created.map((care) => care.id) } },
        include: nursingInclude,
        orderBy: { scheduledAt: 'asc' },
      });
    });
  }

  async recordWardRound(dto: CreateWardRoundDto, user: AuthenticatedUser) {
    const condition = dto.condition.trim();
    if (condition.length < 3) {
      throw new BadRequestException("L'état actuel du patient doit être renseigné.");
    }
    const hospitalization = await this.prisma.hospitalization.findFirst({
      where: { patientId: dto.patientId, status: 'ACTIVE' },
      include: { patient: true, bed: { include: { room: true } } },
    });
    if (!hospitalization) {
      throw new BadRequestException('Le patient ne possède aucune hospitalisation active.');
    }
    const now = new Date();
    const observations = [condition, dto.observations?.trim()].filter(Boolean).join(' — ');
    return this.prisma.$transaction(async (transaction) => {
      const care = await transaction.nursingCare.create({
        data: {
          patientId: dto.patientId,
          hospitalizationId: hospitalization.id,
          orderedById: user.id,
          assignedNurseId: user.id,
          performedById: user.id,
          type: NursingCareType.MONITORING,
          status: NursingCareStatus.COMPLETED,
          label: `Tour de salle · ${hospitalization.bed.room.name} · lit ${hospitalization.bed.code}`,
          instructions: dto.actions?.trim() || undefined,
          observations,
          vitalSigns: dto.vitalSigns as Prisma.InputJsonValue | undefined,
          scheduledAt: now,
          startedAt: now,
          performedAt: now,
        },
        include: nursingInclude,
      });
      if (dto.unstable) {
        await transaction.emergencyAlert.create({
          data: {
            title: `Patient instable · ${hospitalization.patient.medicalRecordNumber}`,
            message: observations,
            location: `${hospitalization.bed.room.name} · lit ${hospitalization.bed.code}`,
            severity: EmergencySeverity.CRITICAL,
            targetRole: Role.DOCTOR,
            patientId: dto.patientId,
            hospitalizationId: hospitalization.id,
            createdById: user.id,
          },
        });
      }
      return care;
    });
  }

  async update(id: string, dto: UpdateNursingCareDto, user: AuthenticatedUser) {
    const care = await this.prisma.nursingCare.findUnique({ where: { id } });
    if (!care) throw new NotFoundException('Soin infirmier introuvable.');
    const nurseOnly =
      hasAnyRole(user, [Role.NURSE]) &&
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    if (nurseOnly && care.assignedNurseId && care.assignedNurseId !== user.id) {
      throw new ForbiddenException('Ce soin est attribué à un autre infirmier.');
    }
    if (nurseOnly && dto.assignedNurseId && dto.assignedNurseId !== user.id) {
      throw new ForbiddenException('Un infirmier ne peut pas réattribuer ce soin à un collègue.');
    }
    const administrationStatuses: NursingCareStatus[] = [
      NursingCareStatus.IN_PROGRESS,
      NursingCareStatus.COMPLETED,
      NursingCareStatus.MISSED,
    ];
    if (
      administrationStatuses.includes(dto.status) &&
      !hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.NURSE])
    ) {
      throw new ForbiddenException(
        "Seul un infirmier autorisé peut enregistrer l'administration effective du soin.",
      );
    }
    if (care.status !== dto.status && !transitions[care.status].includes(dto.status)) {
      throw new BadRequestException(`Passage de ${care.status} vers ${dto.status} interdit.`);
    }
    await this.assertNurse(dto.assignedNurseId);

    const performed =
      dto.status === NursingCareStatus.IN_PROGRESS ||
      dto.status === NursingCareStatus.COMPLETED ||
      dto.status === NursingCareStatus.MISSED;
    const performer = performed ? user.id : undefined;
    const takingOwnership = nurseOnly && !care.assignedNurseId && performed;
    const isMedication = medicationCareTypes.includes(care.type);
    const outcome =
      dto.administrationOutcome ??
      (dto.status === NursingCareStatus.COMPLETED
        ? 'ADMINISTERED'
        : dto.status === NursingCareStatus.MISSED
          ? 'MISSED'
          : undefined);

    if (dto.status === NursingCareStatus.COMPLETED && outcome && outcome !== 'ADMINISTERED') {
      throw new BadRequestException(
        'Un soin terminé doit être confirmé comme administré. Utilisez « non réalisé » pour un refus ou une omission.',
      );
    }
    if (
      dto.status === NursingCareStatus.MISSED &&
      (!outcome || !['REFUSED', 'OMITTED', 'MISSED'].includes(outcome))
    ) {
      throw new BadRequestException('Précisez si le traitement a été refusé, omis ou manqué.');
    }
    if (
      dto.status === NursingCareStatus.MISSED &&
      (!dto.omissionReason || dto.omissionReason.trim().length < 3)
    ) {
      throw new BadRequestException('Le motif de non-administration est obligatoire.');
    }
    if (
      isMedication &&
      outcome === 'ADMINISTERED' &&
      (!dto.patientBarcode?.trim() || !dto.medicationBarcode?.trim())
    ) {
      throw new BadRequestException(
        'Scannez ou saisissez le code du bracelet patient et le code du médicament avant de confirmer l’administration.',
      );
    }

    const performedAt =
      dto.status === NursingCareStatus.COMPLETED || dto.status === NursingCareStatus.MISSED
        ? new Date()
        : undefined;
    const {
      administrationOutcome: _administrationOutcome,
      administeredDose,
      omissionReason,
      patientBarcode,
      medicationBarcode,
      ...nursingData
    } = dto;
    void _administrationOutcome;

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.nursingCare.update({
        where: { id },
        data: {
          ...nursingData,
          observations: dto.observations?.trim() || undefined,
          adverseReaction: dto.adverseReaction?.trim() || undefined,
          assignedNurseId: takingOwnership ? user.id : dto.assignedNurseId,
          performedById: performer,
          startedAt:
            dto.status === NursingCareStatus.IN_PROGRESS && !care.startedAt
              ? new Date()
              : undefined,
          performedAt,
          vitalSigns: dto.vitalSigns as Prisma.InputJsonValue | undefined,
        },
        include: nursingInclude,
      });

      if (isMedication && performedAt && outcome) {
        const signatureHash = this.governance.medicationSignature({
          nursingCareId: care.id,
          patientId: care.patientId,
          nurseId: user.id,
          status: outcome,
          performedAt,
          administeredDose: administeredDose?.trim() || care.dose || undefined,
        });
        const eventId = randomUUID();
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "MedicationAdministrationEvent" (
            "id", "nursingCareId", "patientId", "nurseId", "status", "scheduledAt",
            "performedAt", "prescribedDose", "administeredDose", "route", "omissionReason",
            "comment", "adverseReaction", "patientBarcode", "medicationBarcode",
            "signatureHash", "createdAt"
          ) VALUES (
            ${eventId}, ${care.id}, ${care.patientId}, ${user.id}, ${outcome},
            ${care.scheduledAt}, ${performedAt}, ${care.dose ?? null},
            ${administeredDose?.trim() || care.dose || null}, ${care.route ?? null},
            ${omissionReason?.trim() || null}, ${dto.observations?.trim() || null},
            ${dto.adverseReaction?.trim() || null}, ${patientBarcode?.trim() || null},
            ${medicationBarcode?.trim() || null}, ${signatureHash}, CURRENT_TIMESTAMP
          )
        `);

        if (outcome === 'ADMINISTERED') {
          await transaction.$executeRaw(Prisma.sql`
            INSERT INTO "IdentityVerification" (
              "id", "patientId", "verifiedById", "context", "nameConfirmed",
              "recordNumberConfirmed", "birthDateConfirmed", "braceletCode",
              "medicationCode", "success", "notes", "verifiedAt"
            ) VALUES (
              ${randomUUID()}, ${care.patientId}, ${user.id}, 'MEDICATION', true,
              true, false, ${patientBarcode!.trim()}, ${medicationBarcode!.trim()}, true,
              ${`Administration ${eventId} : double contrôle bracelet et médicament.`}, CURRENT_TIMESTAMP
            )
          `);
        }

        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: `MEDICATION_${outcome}`,
            entity: 'MedicationAdministrationEvent',
            entityId: eventId,
            metadata: {
              patientId: care.patientId,
              nursingCareId: care.id,
              scheduledAt: care.scheduledAt,
              performedAt,
              medicationName: care.medicationName,
              prescribedDose: care.dose,
              administeredDose: administeredDose?.trim() || care.dose,
              route: care.route,
              omissionReason: omissionReason?.trim() || null,
              patientBarcode: patientBarcode?.trim() || null,
              medicationBarcode: medicationBarcode?.trim() || null,
              signatureHash,
            },
          },
        });
      }
      return updated;
    });
  }

  private async assertNurse(userId?: string) {
    if (!userId) return;
    const nurse = await this.prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true,
        OR: [{ role: Role.NURSE }, { additionalRoles: { has: Role.NURSE } }],
      },
    });
    if (!nurse) {
      throw new BadRequestException("L'infirmier sélectionné est inactif ou non autorisé.");
    }
  }
}
