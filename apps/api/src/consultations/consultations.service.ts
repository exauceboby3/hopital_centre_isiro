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
import { encodeVitalSignMetadata, presentVitalSign } from '../common/vital-sign-metadata';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMedicalSignature,
  decodeClinicalReport,
  decodeMedicalSignature,
  mergeClinicalReport,
} from './clinical-report';
import type { ConsultationDecision } from './clinical-report';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreateVitalSignDto } from './dto/create-vital-sign.dto';
import { SignConsultationDto } from './dto/sign-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';

const consultationInclude = {
  patient: true,
  doctor: { include: { user: { select: { id: true, username: true } } } },
  appointment: true,
  vitalSigns: { orderBy: { recordedAt: 'desc' as const } },
  careAuthorization: { include: { service: true, invoice: true } },
  examRequests: {
    orderBy: { requestedAt: 'desc' as const },
    include: { careAuthorization: { include: { service: true, invoice: true } } },
  },
} satisfies Prisma.ConsultationInclude;

type ConsultationRow = Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>;

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizations: FinancialAuthorizationService,
  ) {}

  async list(user: AuthenticatedUser, patientId?: string, status?: ConsultationStatus) {
    const privileged = hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN]);
    const clinicalUser = hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
    let assignedDoctorId: string | undefined;

    if (!privileged && clinicalUser) {
      const doctor = await this.prisma.doctorProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!doctor) return [];
      assignedDoctorId = doctor.id;
    }

    const rows = await this.prisma.consultation.findMany({
      where: {
        ...(patientId ? { patientId } : {}),
        ...(status ? { status } : {}),
        ...(assignedDoctorId ? { doctorId: assignedDoctorId } : {}),
      },
      include: consultationInclude,
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
    return rows.map((row) => this.present(row));
  }

  async create(dto: CreateConsultationDto, user: AuthenticatedUser) {
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { userId: user.id } });
    if (!doctor) throw new ForbiddenException('Profil médecin requis.');

    return this.prisma.$transaction(async (transaction) => {
      const appointment = dto.appointmentId
        ? await transaction.appointment.findUnique({
            where: { id: dto.appointmentId },
            include: { careAuthorization: true, consultation: true },
          })
        : null;
      if (dto.appointmentId && !appointment) throw new NotFoundException('Rendez-vous introuvable.');
      if (appointment && appointment.patientId !== dto.patientId) {
        throw new BadRequestException('Le rendez-vous appartient à un autre patient.');
      }
      if (appointment?.consultation) {
        throw new ConflictException(
          'Une consultation existe déjà pour ce rendez-vous. Ouvrez la consultation affectée au lieu d’en créer une nouvelle.',
        );
      }
      if (appointment?.doctorId && appointment.doctorId !== doctor.id) {
        throw new ForbiddenException('Ce patient est affecté à un autre médecin.');
      }
      if (appointment && appointment.status !== AppointmentStatus.CHECKED_IN) {
        throw new BadRequestException(
          'Le patient doit être enregistré comme arrivé et financièrement autorisé par la réception avant la consultation.',
        );
      }

      const existingActive = await transaction.consultation.findFirst({
        where: {
          patientId: dto.patientId,
          status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
        },
        select: { id: true },
      });
      if (existingActive) {
        throw new ConflictException(
          'Ce patient possède déjà une consultation active. Terminez ou transférez cet épisode avant d’en ouvrir un autre.',
        );
      }

      const authorizationId = dto.authorizationId ?? appointment?.careAuthorization?.id;
      if (!authorizationId) {
        throw new BadRequestException(
          'Une autorisation de consultation payée est obligatoire avant de rencontrer le médecin.',
        );
      }

      const consultation = await transaction.consultation.create({
        data: {
          patientId: dto.patientId,
          appointmentId: dto.appointmentId,
          reason: dto.reason.trim(),
          report: mergeClinicalReport(null, { chiefComplaint: dto.reason }),
          doctorId: doctor.id,
          status: ConsultationStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
      await this.authorizations.consume(
        authorizationId,
        dto.patientId,
        BillableServiceType.CONSULTATION,
        { consultationId: consultation.id },
        transaction,
      );
      if (dto.appointmentId) {
        await transaction.appointment.update({
          where: { id: dto.appointmentId },
          data: {
            status: AppointmentStatus.CHECKED_IN,
            journeyStage: PatientJourneyStage.IN_CONSULTATION,
            journeyUpdatedAt: new Date(),
          },
        });
      }
      const row = await transaction.consultation.findUniqueOrThrow({
        where: { id: consultation.id },
        include: consultationInclude,
      });
      return this.present(row);
    });
  }

  async update(id: string, dto: UpdateConsultationDto, user: AuthenticatedUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { doctor: true },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    this.assertAssignedDoctor(consultation.doctor.userId, user);

    const signature = decodeMedicalSignature(consultation.certificate);
    if (signature && !dto.amendmentReason) {
      throw new ConflictException(
        'Ce dossier est signé. Une raison d’amendement est obligatoire pour toute correction.',
      );
    }

    const {
      chiefComplaint,
      presentIllnessHistory,
      anamnesisComplements,
      medicalHistory,
      physicalExamination,
      paraclinicalExams,
      diagnosis,
      treatmentPlan,
      decision,
      amendmentReason,
      report,
      status,
      orientation,
      prescription,
    } = dto;

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.consultation.findUniqueOrThrow({
        where: { id },
        include: { examRequests: { select: { status: true } } },
      });
      const clinicalReport = mergeClinicalReport(current.report, {
        chiefComplaint,
        presentIllnessHistory,
        anamnesisComplements,
        medicalHistory,
        physicalExamination: physicalExamination ?? report,
        paraclinicalExams,
        diagnosis,
        treatmentPlan,
        decision,
        amendmentReason,
        amendedAt: amendmentReason ? new Date().toISOString() : undefined,
        amendedById: amendmentReason ? user.id : undefined,
      });

      const effectiveStatus = this.resolveStatus(current.status, status, decision);
      const effectiveOrientation = orientation ?? this.decisionLabel(decision) ?? current.orientation;
      const updated = await transaction.consultation.update({
        where: { id },
        data: {
          report: clinicalReport,
          orientation: effectiveOrientation,
          prescription: prescription === undefined ? current.prescription : prescription,
          certificate: signature ? null : undefined,
          status: effectiveStatus,
          completedAt:
            effectiveStatus === ConsultationStatus.COMPLETED
              ? current.completedAt ?? new Date()
              : null,
        },
        include: consultationInclude,
      });

      if (consultation.appointmentId) {
        const awaitingLaboratory = current.examRequests.some(
          (exam) => !['VALIDATED', 'CANCELLED'].includes(exam.status),
        );
        const journey = this.resolveJourney(decision, effectiveStatus, awaitingLaboratory);
        await transaction.appointment.update({
          where: { id: consultation.appointmentId },
          data: {
            status:
              journey === PatientJourneyStage.COMPLETED
                ? AppointmentStatus.COMPLETED
                : AppointmentStatus.CHECKED_IN,
            journeyStage: journey,
            journeyUpdatedAt: new Date(),
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: signature ? 'CONSULTATION_AMENDED' : 'CONSULTATION_UPDATED',
          entity: 'Consultation',
          entityId: id,
          metadata: {
            decision: decision ?? null,
            status: effectiveStatus,
            amendmentReason: amendmentReason ?? null,
            ...(signature
              ? {
                  previousSignedReport: current.report,
                  previousSignature: current.certificate,
                }
              : {}),
          },
        },
      });
      return this.present(updated);
    });
  }

  async sign(id: string, dto: SignConsultationDto, user: AuthenticatedUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id },
      include: { doctor: true },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    this.assertAssignedDoctor(consultation.doctor.userId, user);
    if (decodeMedicalSignature(consultation.certificate)) {
      throw new ConflictException('Cette consultation est déjà signée.');
    }

    const report = decodeClinicalReport(consultation.report);
    const required = [
      report.sections.chiefComplaint,
      report.sections.presentIllnessHistory,
      report.sections.physicalExamination,
      report.sections.diagnosis,
      report.sections.treatmentPlan,
      report.sections.decision,
    ];
    if (required.some((value) => !value)) {
      throw new BadRequestException(
        'Complétez la plainte, l’histoire de la maladie, l’examen physique, le diagnostic, la conduite thérapeutique et la décision finale avant de signer.',
      );
    }

    const signedAt = new Date();
    const doctorName = [
      consultation.doctor.lastName,
      consultation.doctor.postName,
      consultation.doctor.firstName,
    ]
      .filter(Boolean)
      .join(' ');
    const signature = createMedicalSignature({
      doctorUserId: user.id,
      doctorName,
      licenseNumber: consultation.doctor.licenseNumber,
      signedAt,
      report: consultation.report ?? '',
    });

    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.consultation.update({
        where: { id },
        data: {
          certificate: JSON.stringify({
            ...signature,
            confirmation: dto.confirmation?.trim() || undefined,
          }),
        },
        include: consultationInclude,
      });
      await transaction.auditLog.create({
        data: {
          userId: user.id,
          action: 'CONSULTATION_SIGNED',
          entity: 'Consultation',
          entityId: id,
          metadata: { signedAt: signature.signedAt, hash: signature.hash },
        },
      });
      return this.present(updated);
    });
  }

  async addVitalSign(consultationId: string, dto: CreateVitalSignDto, userId: string) {
    const consultation = await this.prisma.consultation.findUnique({ where: { id: consultationId } });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    const { respiratoryRate, bloodGlucoseMgDl, notes, ...vitals } = dto;
    const row = await this.prisma.vitalSign.create({
      data: {
        ...vitals,
        notes: encodeVitalSignMetadata({
          respiratoryRate,
          bloodGlucoseMgDl,
          clinicalNotes: notes,
        }),
        patientId: consultation.patientId,
        consultationId,
        recordedById: userId,
      },
    });
    return presentVitalSign(row);
  }

  async requestHospitalization(
    consultationId: string,
    serviceId: string,
    user: AuthenticatedUser,
  ) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: { doctor: true, patient: true },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');
    this.assertAssignedDoctor(consultation.doctor.userId, user);

    return this.prisma.$transaction(async (transaction) => {
      const authorization = await this.authorizations.createFromService(
        {
          patientId: consultation.patientId,
          serviceId,
          createdById: user.id,
          expectedType: BillableServiceType.HOSPITALIZATION,
        },
        transaction,
      );
      await transaction.consultation.update({
        where: { id: consultationId },
        data: { orientation: 'Hospitalisation — admission après validation financière' },
      });
      if (consultation.appointmentId) {
        await transaction.appointment.update({
          where: { id: consultation.appointmentId },
          data: {
            journeyStage: PatientJourneyStage.HOSPITALIZATION,
            journeyUpdatedAt: new Date(),
          },
        });
      }
      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          OR: [
            { role: { in: [Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER] } },
            { additionalRoles: { hasSome: [Role.RECEPTIONIST, Role.SECRETARY, Role.CASHIER] } },
          ],
        },
        select: { id: true },
      });
      const name = [
        consultation.patient.lastName,
        consultation.patient.postName,
        consultation.patient.firstName,
      ]
        .filter(Boolean)
        .join(' ');
      const notifications = recipients
        .filter((recipient) => recipient.id !== user.id)
        .map((recipient) => ({
          senderId: user.id,
          receiverId: recipient.id,
          content: `Orientation hospitalisation : ${name} (${consultation.patient.medicalRecordNumber}). Facture ${authorization.invoice.number} à traiter avant attribution d’un lit.`,
        }));
      if (notifications.length) await transaction.message.createMany({ data: notifications });
      return authorization;
    });
  }

  private present(row: ConsultationRow) {
    return {
      ...row,
      vitalSigns: row.vitalSigns.map((vital) => presentVitalSign(vital)),
      clinicalReport: decodeClinicalReport(row.report).sections,
      signature: decodeMedicalSignature(row.certificate),
    };
  }

  private assertAssignedDoctor(assignedUserId: string, user: AuthenticatedUser) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN])) return;
    if (
      !hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]) ||
      assignedUserId !== user.id
    ) {
      throw new ForbiddenException('Cette consultation appartient à un autre médecin.');
    }
  }

  private resolveStatus(
    current: ConsultationStatus,
    requested?: ConsultationStatus,
    decision?: ConsultationDecision,
  ) {
    if (decision && ['DISCHARGE', 'COMPLETE', 'PRESCRIPTION'].includes(decision)) {
      return ConsultationStatus.COMPLETED;
    }
    if (
      decision &&
      ['CONTINUE', 'LABORATORY', 'IMAGING', 'HOSPITALIZATION', 'TRANSFER'].includes(decision)
    ) {
      return ConsultationStatus.IN_PROGRESS;
    }
    return requested ?? current;
  }

  private resolveJourney(
    decision: ConsultationDecision | undefined,
    status: ConsultationStatus,
    awaitingLaboratory: boolean,
  ) {
    if (decision === 'LABORATORY' || awaitingLaboratory) return PatientJourneyStage.LABORATORY;
    if (decision === 'HOSPITALIZATION') return PatientJourneyStage.HOSPITALIZATION;
    if (decision === 'TRANSFER') return PatientJourneyStage.WAITING_DOCTOR;
    if (status === ConsultationStatus.COMPLETED) return PatientJourneyStage.COMPLETED;
    return PatientJourneyStage.IN_CONSULTATION;
  }

  private decisionLabel(decision?: ConsultationDecision) {
    const labels: Partial<Record<ConsultationDecision, string>> = {
      CONTINUE: 'Poursuite de la prise en charge',
      LABORATORY: 'Laboratoire — examens demandés',
      IMAGING: 'Radiologie / imagerie médicale',
      HOSPITALIZATION: 'Hospitalisation — admission après validation financière',
      TRANSFER: 'Transfert vers un autre médecin',
      PRESCRIPTION: 'Prescription et retour à domicile',
      DISCHARGE: 'Patient libéré',
      COMPLETE: 'Consultation terminée',
    };
    return decision ? labels[decision] : undefined;
  }
}
