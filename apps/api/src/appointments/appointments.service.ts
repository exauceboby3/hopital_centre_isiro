import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  BillableServiceType,
  ConsultationStatus,
  PatientJourneyStage,
  Prisma,
  Role,
} from '@prisma/client';
import { FinancialAuthorizationService } from '../billing/financial-authorization.service';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { hospitalDayRange } from '../common/hospital-time';
import { encodeVitalSignMetadata, presentVitalSign } from '../common/vital-sign-metadata';
import { mergeClinicalReport } from '../consultations/clinical-report';
import { CreateVitalSignDto } from '../consultations/dto/create-vital-sign.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

const appointmentInclude = {
  patient: {
    include: { vitalSigns: { orderBy: { recordedAt: 'desc' as const }, take: 1 } },
  },
  doctor: { include: { user: { select: { username: true } } } },
  createdBy: { select: { id: true, username: true } },
  careAuthorization: { include: { service: true, invoice: { include: { payments: true } } } },
  consultation: {
    include: {
      examRequests: {
        select: { id: true, type: true, status: true, requestedAt: true, validatedAt: true },
        orderBy: { requestedAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof appointmentInclude }>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  async list(
    from?: string,
    to?: string,
    status?: AppointmentStatus,
    scope: 'active' | 'history' = 'active',
  ) {
    const { start: startToday } = hospitalDayRange();

    const scopeWhere: Prisma.AppointmentWhereInput =
      scope === 'history'
        ? {
            status: {
              in: [
                AppointmentStatus.COMPLETED,
                AppointmentStatus.CANCELLED,
                AppointmentStatus.NO_SHOW,
              ],
            },
          }
        : {
            OR: [
              {
                status: AppointmentStatus.SCHEDULED,
                scheduledAt: { gte: startToday },
              },
              {
                status: AppointmentStatus.CHECKED_IN,
                journeyStage: {
                  notIn: [PatientJourneyStage.COMPLETED, PatientJourneyStage.CANCELLED],
                },
              },
            ],
          };

    const rows = await this.prisma.appointment.findMany({
      where: {
        AND: [
          scopeWhere,
          status ? { status } : {},
          from || to
            ? {
                scheduledAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {},
        ],
      },
      include: appointmentInclude,
      orderBy: scope === 'history' ? { scheduledAt: 'desc' } : { scheduledAt: 'asc' },
      take: 250,
    });
    return rows.map((row) => this.present(row));
  }


  async markPastScheduledAsNoShow(reference = new Date()) {
    const { start } = hospitalDayRange(reference);
    return this.prisma.appointment.updateMany({
      where: {
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: { lt: start },
      },
      data: {
        status: AppointmentStatus.NO_SHOW,
        journeyStage: PatientJourneyStage.CANCELLED,
        journeyUpdatedAt: reference,
      },
    });
  }

  async waitingRoom(userId: string) {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!doctor) return [];
    const rows = await this.prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: AppointmentStatus.CHECKED_IN,
        doctorAcknowledgedAt: null,
      },
      include: appointmentInclude,
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
    return rows.map((row) => this.present(row));
  }


  create(dto: CreateAppointmentDto, createdById: string) {
    return this.prisma.$transaction(async (transaction) => {
      const { billableServiceId, ...appointmentData } = dto;
      const scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        throw new BadRequestException('La date du rendez-vous est invalide.');
      }
      if (scheduledAt.getTime() < Date.now() - 5 * 60_000) {
        throw new BadRequestException('Un nouveau rendez-vous ne peut pas être programmé dans le passé.');
      }
      if (dto.doctorId) await this.assertActiveDoctor(transaction, dto.doctorId);

      const activeEpisode = await transaction.appointment.findFirst({
        where: {
          patientId: dto.patientId,
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.CHECKED_IN] },
          journeyStage: { notIn: [PatientJourneyStage.COMPLETED, PatientJourneyStage.CANCELLED] },
        },
        select: { id: true },
      });
      if (activeEpisode) {
        throw new ConflictException(
          'Ce patient possède déjà un rendez-vous ou un parcours actif. Ouvrez cet épisode au lieu de créer un doublon.',
        );
      }

      const appointment = await transaction.appointment.create({
        data: {
          ...appointmentData,
          scheduledAt,
          createdById,
        },
      });
      await this.authorizations.createFromService(
        {
          patientId: dto.patientId,
          serviceId: billableServiceId,
          createdById,
          expectedType: BillableServiceType.CONSULTATION,
          appointmentId: appointment.id,
        },
        transaction,
      );
      const row = await transaction.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: appointmentInclude,
      });
      return this.present(row);
    });
  }

  async update(id: string, dto: UpdateAppointmentDto, updatedById: string) {
    return this.prisma.$transaction(async (transaction) => {
      const appointment = await transaction.appointment.findUnique({
        where: { id },
        include: { careAuthorization: true, consultation: true },
      });
      if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
      if (dto.doctorId) await this.assertActiveDoctor(transaction, dto.doctorId);
      const targetDoctorId = dto.doctorId ?? appointment.doctorId;

      if (dto.status === AppointmentStatus.CHECKED_IN) {
        if (!targetDoctorId) {
          throw new ConflictException('Affectez un médecin avant de marquer le patient comme arrivé.');
        }
        if (!appointment.careAuthorization) {
          throw new NotFoundException('Autorisation financière de consultation introuvable.');
        }
        await this.authorizations.assertAuthorized(
          appointment.careAuthorization.id,
          appointment.patientId,
          BillableServiceType.CONSULTATION,
          transaction,
        );
      }

      const reassigned = dto.doctorId !== undefined && dto.doctorId !== appointment.doctorId;
      await transaction.appointment.update({
        where: { id },
        data: {
          ...dto,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          doctorAcknowledgedAt:
            reassigned || dto.status === AppointmentStatus.CHECKED_IN ? null : undefined,
          journeyStage:
            dto.status === AppointmentStatus.CHECKED_IN
              ? PatientJourneyStage.WAITING_DOCTOR
              : dto.status === AppointmentStatus.COMPLETED
                ? PatientJourneyStage.COMPLETED
                : dto.status === AppointmentStatus.CANCELLED ||
                    dto.status === AppointmentStatus.NO_SHOW
                  ? PatientJourneyStage.CANCELLED
                  : undefined,
          journeyUpdatedAt: dto.status ? new Date() : undefined,
        },
      });

      if (dto.status === AppointmentStatus.CHECKED_IN && targetDoctorId && !appointment.consultation) {
        await transaction.consultation.create({
          data: {
            patientId: appointment.patientId,
            doctorId: targetDoctorId,
            appointmentId: appointment.id,
            reason: appointment.reason?.trim() || appointment.service,
            report: mergeClinicalReport(null, {
              chiefComplaint: appointment.reason?.trim() || appointment.service,
            }),
            status: ConsultationStatus.WAITING,
          },
        });
      }

      const readyForDoctor =
        dto.status === AppointmentStatus.CHECKED_IN ||
        (reassigned && appointment.status === AppointmentStatus.CHECKED_IN);
      if (targetDoctorId && readyForDoctor) {
        await this.notifyDoctor(transaction, updatedById, id);
      }
      const row = await transaction.appointment.findUniqueOrThrow({
        where: { id },
        include: appointmentInclude,
      });
      return this.present(row);
    });
  }

  async recordVitals(id: string, dto: CreateVitalSignDto, recordedById: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      select: { patientId: true },
    });
    if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
    const { respiratoryRate, bloodGlucoseMgDl, notes, ...vitals } = dto;
    const row = await this.prisma.vitalSign.create({
      data: {
        ...vitals,
        notes: encodeVitalSignMetadata({
          respiratoryRate,
          bloodGlucoseMgDl,
          clinicalNotes: notes,
        }),
        patientId: appointment.patientId,
        recordedById,
      },
    });
    return presentVitalSign(row);
  }

  async acknowledge(id: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const appointment = await transaction.appointment.findUnique({
        where: { id },
        include: { doctor: true, careAuthorization: true, consultation: true },
      });
      if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
      this.assertAssignedDoctor(appointment.doctor?.userId, user);
      if (appointment.status !== AppointmentStatus.CHECKED_IN) {
        throw new ForbiddenException("Ce patient n'est plus dans la salle d'attente.");
      }
      if (!appointment.careAuthorization) {
        throw new NotFoundException('Autorisation financière de consultation introuvable.');
      }
      await this.authorizations.assertAuthorized(
        appointment.careAuthorization.id,
        appointment.patientId,
        BillableServiceType.CONSULTATION,
        transaction,
      );

      let consultation = appointment.consultation;
      if (!consultation) {
        if (!appointment.doctorId) throw new ConflictException('Aucun médecin affecté.');
        consultation = await transaction.consultation.create({
          data: {
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            appointmentId: appointment.id,
            reason: appointment.reason?.trim() || appointment.service,
            report: mergeClinicalReport(null, {
              chiefComplaint: appointment.reason?.trim() || appointment.service,
            }),
            status: ConsultationStatus.WAITING,
          },
        });
      }

      if (appointment.careAuthorization.status !== 'CONSUMED') {
        await this.authorizations.consume(
          appointment.careAuthorization.id,
          appointment.patientId,
          BillableServiceType.CONSULTATION,
          { consultationId: consultation.id },
          transaction,
        );
      }
      await transaction.consultation.update({
        where: { id: consultation.id },
        data: {
          status: ConsultationStatus.IN_PROGRESS,
          startedAt: consultation.startedAt ?? new Date(),
        },
      });
      const row = await transaction.appointment.update({
        where: { id },
        data: {
          doctorAcknowledgedAt: new Date(),
          journeyStage: PatientJourneyStage.IN_CONSULTATION,
          journeyUpdatedAt: new Date(),
        },
        include: appointmentInclude,
      });
      return this.present(row);
    });
  }

  async transfer(id: string, doctorId: string, reason: string, user: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const appointment = await transaction.appointment.findUnique({
        where: { id },
        include: { doctor: true, patient: true, consultation: true },
      });
      if (!appointment) throw new NotFoundException('Rendez-vous introuvable.');
      this.assertAssignedDoctor(appointment.doctor?.userId, user);
      await this.assertActiveDoctor(transaction, doctorId);
      if (appointment.doctorId === doctorId) {
        throw new ConflictException('Le patient est déjà affecté à ce médecin.');
      }
      const previousDoctorId = appointment.doctorId;
      const updated = await transaction.appointment.update({
        where: { id },
        data: {
          doctorId,
          doctorAcknowledgedAt: null,
          journeyStage: PatientJourneyStage.WAITING_DOCTOR,
          journeyUpdatedAt: new Date(),
          notes: [appointment.notes, `Transfert : ${reason.trim()}`].filter(Boolean).join('\n'),
        },
        include: appointmentInclude,
      });
      if (appointment.consultation) {
        await transaction.consultation.update({
          where: { id: appointment.consultation.id },
          data: { doctorId, status: ConsultationStatus.WAITING, startedAt: null },
        });
      }
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'PATIENT_TRANSFERRED',
          entity: 'Appointment',
          entityId: id,
          metadata: {
            patientId: appointment.patientId,
            fromDoctorId: previousDoctorId,
            toDoctorId: doctorId,
            reason: reason.trim(),
          },
        },
      });
      await this.notifyDoctor(transaction, user.id, id);
      return this.present(updated);
    });
  }

  private present(row: AppointmentRow) {
    return {
      ...row,
      patient: {
        ...row.patient,
        vitalSigns: row.patient.vitalSigns.map((vital) => presentVitalSign(vital)),
      },
    };
  }

  private async notifyDoctor(
    transaction: Prisma.TransactionClient,
    senderId: string,
    appointmentId: string,
  ) {
    const appointment = await transaction.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: true, doctor: true },
    });
    if (!appointment.doctor || appointment.doctor.userId === senderId) return;
    const patientName = [
      appointment.patient.lastName,
      appointment.patient.postName,
      appointment.patient.firstName,
    ]
      .filter(Boolean)
      .join(' ');
    await transaction.message.create({
      data: {
        senderId,
        receiverId: appointment.doctor.userId,
        content: `Patient prêt pour consultation : ${patientName} (${appointment.patient.medicalRecordNumber}) est affecté à votre file et son autorisation financière est validée.`,
      },
    });
  }

  private async assertActiveDoctor(transaction: Prisma.TransactionClient, doctorId: string) {
    const doctor = await transaction.doctorProfile.findFirst({
      where: { id: doctorId, user: { isActive: true } },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Le médecin sélectionné est introuvable ou inactif.');
  }

  private assertAssignedDoctor(assignedUserId: string | undefined, user: AuthenticatedUser) {
    if (!hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]) || !assignedUserId || assignedUserId !== user.id) {
      throw new ForbiddenException('Ce patient est attribué à un autre médecin.');
    }
  }
}
