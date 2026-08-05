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
import { stripLabFinancialDetails } from '../laboratory/laboratory.service.helpers';
import {
  createMedicalSignature,
  decodeClinicalReport,
  decodeMedicalSignature,
  mergeClinicalReport,
} from './clinical-report';
import type { ClinicalReportSections, ConsultationDecision } from './clinical-report';
import {
  assertCanSignConsultation,
  assertLaboratoryResultsComplete,
  FINAL_CONSULTATION_DECISIONS,
} from './consultation-finalization.service';
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
  prescriptions: {
    orderBy: { prescribedAt: 'desc' as const },
    include: {
      invoice: true,
      items: { include: { medication: true } },
    },
  },
} satisfies Prisma.ConsultationInclude;

type ConsultationRow = Prisma.ConsultationGetPayload<{ include: typeof consultationInclude }>;

type InitialAssessmentField =
  | 'chiefComplaint'
  | 'presentIllnessHistory'
  | 'anamnesisComplements'
  | 'medicalHistory'
  | 'physicalExamination'
  | 'paraclinicalExams'
  | 'diagnosis'
  | 'treatmentPlan';

const initialAssessmentFields: InitialAssessmentField[] = [
  'chiefComplaint',
  'presentIllnessHistory',
  'anamnesisComplements',
  'medicalHistory',
  'physicalExamination',
  'paraclinicalExams',
  'diagnosis',
  'treatmentPlan',
];

const normalizeClinicalValue = (value?: string | null) => value?.trim() ?? '';

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
    return rows.map((row) => this.present(row, user));
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
      if (dto.appointmentId && !appointment)
        throw new NotFoundException('Rendez-vous introuvable.');
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
      return this.present(row, user);
    });
  }

  async update(id: string, dto: UpdateConsultationDto, user: AuthenticatedUser) {
    const {
      chiefComplaint,
      presentIllnessHistory,
      anamnesisComplements,
      medicalHistory,
      physicalExamination,
      paraclinicalExams,
      diagnosis,
      treatmentPlan,
      laboratoryInterpretation,
      postLaboratoryDiagnosis,
      postLaboratoryPlan,
      postLaboratoryNotes,
      decision,
      amendmentReason,
      report,
      orientation,
      prescription,
    } = dto;

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.consultation.findUnique({
        where: { id },
        include: {
          doctor: { select: { userId: true } },
          examRequests: { select: { status: true } },
          appointment: { select: { journeyStage: true } },
        },
      });
      if (!current) throw new NotFoundException('Consultation introuvable.');
      this.assertAssignedDoctor(current.doctor.userId, user);
      if (decodeMedicalSignature(current.certificate)) {
        throw new ConflictException(
          'Ce dossier est signé et immuable. Créez une note clinique complémentaire au lieu de modifier le document signé.',
        );
      }
      if (current.status === ConsultationStatus.CANCELLED) {
        throw new ConflictException('Une consultation annulée ne peut plus être modifiée.');
      }
      const currentSections = decodeClinicalReport(current.report).sections;
      const hasLaboratoryHistory =
        current.examRequests.length > 0 ||
        current.appointment?.journeyStage === PatientJourneyStage.LABORATORY ||
        current.appointment?.journeyStage === PatientJourneyStage.RETURN_TO_DOCTOR;
      const firstLaboratorySubmission =
        decision === 'LABORATORY' && !currentSections.preLaboratoryLockedAt;

      if (hasLaboratoryHistory && !firstLaboratorySubmission) {
        this.assertInitialAssessmentUnchanged(currentSections, dto);
      }

      if (decision && FINAL_CONSULTATION_DECISIONS.has(decision)) {
        assertLaboratoryResultsComplete(current.examRequests, 'Décision finale indisponible');
      }

      const clinicalReport = mergeClinicalReport(current.report, {
        chiefComplaint,
        presentIllnessHistory,
        anamnesisComplements,
        medicalHistory,
        physicalExamination: physicalExamination ?? report,
        paraclinicalExams,
        diagnosis,
        treatmentPlan,
        laboratoryInterpretation,
        postLaboratoryDiagnosis,
        postLaboratoryPlan,
        postLaboratoryNotes,
        decision,
        preLaboratoryLockedAt:
          decision === 'LABORATORY' || hasLaboratoryHistory
            ? (currentSections.preLaboratoryLockedAt ?? new Date().toISOString())
            : undefined,
        amendmentReason,
        amendedAt: amendmentReason ? new Date().toISOString() : undefined,
        amendedById: amendmentReason ? user.id : undefined,
      });
      const mergedSections = decodeClinicalReport(clinicalReport).sections;

      if (hasLaboratoryHistory && decision && FINAL_CONSULTATION_DECISIONS.has(decision)) {
        this.assertPostLaboratoryInterpretationComplete(mergedSections);
      }

      const effectiveStatus = this.resolveStatus(current.status, decision);
      const effectiveOrientation =
        orientation ?? this.decisionLabel(decision) ?? current.orientation;
      const claimed = await transaction.consultation.updateMany({
        where: { id, certificate: null, updatedAt: current.updatedAt },
        data: {
          report: clinicalReport,
          orientation: effectiveOrientation,
          prescription: prescription === undefined ? current.prescription : prescription,
          status: effectiveStatus,
          completedAt:
            effectiveStatus === ConsultationStatus.COMPLETED
              ? (current.completedAt ?? new Date())
              : null,
        },
      });
      if (!claimed.count) {
        throw new ConflictException(
          'La consultation a été modifiée ou signée pendant l’enregistrement. Rechargez le dossier.',
        );
      }
      const updated = await transaction.consultation.findUniqueOrThrow({
        where: { id },
        include: consultationInclude,
      });

      if (current.appointmentId) {
        const awaitingLaboratory = current.examRequests.some(
          (exam) => !['VALIDATED', 'CANCELLED'].includes(exam.status),
        );
        const journey = this.resolveJourney(decision, effectiveStatus, awaitingLaboratory);
        await transaction.appointment.update({
          where: { id: current.appointmentId },
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
          action: 'CONSULTATION_UPDATED',
          entity: 'Consultation',
          entityId: id,
          metadata: {
            decision: decision ?? null,
            status: effectiveStatus,
            initialAssessmentLocked: hasLaboratoryHistory || decision === 'LABORATORY',
            amendmentReason: amendmentReason ?? null,
          },
        },
      });
      return this.present(updated, user);
    });
  }

  async sign(id: string, dto: SignConsultationDto, user: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (transaction) => {
        const consultation = await transaction.consultation.findUnique({
          where: { id },
          include: {
            doctor: true,
            examRequests: { select: { status: true } },
            prescriptions: { select: { id: true } },
          },
        });
        if (!consultation) throw new NotFoundException('Consultation introuvable.');
        this.assertAssignedDoctor(consultation.doctor.userId, user);
        if (decodeMedicalSignature(consultation.certificate)) {
          throw new ConflictException('Cette consultation est déjà signée.');
        }

        assertCanSignConsultation(consultation);
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

        const claimed = await transaction.consultation.updateMany({
          where: { id, certificate: null, updatedAt: consultation.updatedAt },
          data: {
            certificate: JSON.stringify({
              ...signature,
              confirmation: dto.confirmation?.trim() || undefined,
            }),
          },
        });
        if (!claimed.count) {
          throw new ConflictException(
            'La consultation a été modifiée pendant la signature. Rechargez le dossier et recommencez.',
          );
        }
        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: 'CONSULTATION_SIGNED',
            entity: 'Consultation',
            entityId: id,
            metadata: { signedAt: signature.signedAt, hash: signature.hash },
          },
        });
        const updated = await transaction.consultation.findUniqueOrThrow({
          where: { id },
          include: consultationInclude,
        });
        return this.present(updated, user);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async addVitalSign(consultationId: string, dto: CreateVitalSignDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const consultation = await transaction.consultation.findUnique({
        where: { id: consultationId },
        select: { patientId: true, status: true, certificate: true },
      });
      if (!consultation) throw new NotFoundException('Consultation introuvable.');
      if (
        consultation.status === ConsultationStatus.COMPLETED ||
        consultation.status === ConsultationStatus.CANCELLED ||
        decodeMedicalSignature(consultation.certificate)
      ) {
        throw new ConflictException(
          'Les constantes ne peuvent plus être ajoutées à une consultation clôturée ou signée.',
        );
      }
      const { respiratoryRate, bloodGlucoseMgDl, notes, ...vitals } = dto;
      const row = await transaction.vitalSign.create({
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
    });
  }

  private present(row: ConsultationRow, user: AuthenticatedUser) {
    const base = {
      ...row,
      vitalSigns: row.vitalSigns.map((vital) => presentVitalSign(vital)),
      clinicalReport: decodeClinicalReport(row.report).sections,
      signature: decodeMedicalSignature(row.certificate),
    };
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER, Role.ACCOUNTANT])) {
      return base;
    }
    const clinicalConsultation = stripLabFinancialDetails(base);
    return {
      ...clinicalConsultation,
      examRequests: row.examRequests.map(stripLabFinancialDetails),
      prescriptions: row.prescriptions.map((prescription) => {
        const { invoice, invoiceId, ...clinicalPrescription } = prescription;
        void invoiceId;
        return {
          ...clinicalPrescription,
          items: clinicalPrescription.items.map((item) => {
            if (!item.medication) return item;
            const { unitPrice, ...medication } = item.medication;
            void unitPrice;
            return { ...item, medication };
          }),
          paymentClearance: {
            inOrder: invoice.status === 'PAID',
            status: invoice.status === 'PAID' ? 'IN_ORDER' : 'TO_REGULARIZE',
          },
        };
      }),
    };
  }

  private assertAssignedDoctor(assignedUserId: string, user: AuthenticatedUser) {
    if (
      !hasAnyRole(user, [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]) ||
      assignedUserId !== user.id
    ) {
      throw new ForbiddenException('Cette consultation appartient à un autre médecin.');
    }
  }

  private assertInitialAssessmentUnchanged(
    current: ClinicalReportSections,
    dto: UpdateConsultationDto,
  ) {
    const changedFields = initialAssessmentFields.filter((field) => {
      const requested = dto[field];
      return (
        requested !== undefined &&
        normalizeClinicalValue(requested) !== normalizeClinicalValue(current[field])
      );
    });
    if (changedFields.length > 0) {
      throw new ConflictException(
        'L’évaluation initiale est verrouillée depuis l’envoi au laboratoire. Ajoutez l’interprétation, le diagnostic réévalué et la conduite post-laboratoire sans modifier les données antérieures.',
      );
    }
  }

  private assertPostLaboratoryInterpretationComplete(report: ClinicalReportSections) {
    const missing = [
      report.laboratoryInterpretation,
      report.postLaboratoryDiagnosis,
      report.postLaboratoryPlan,
    ].some((value) => !value?.trim());
    if (missing) {
      throw new BadRequestException(
        'Complétez l’interprétation des résultats, le diagnostic réévalué et la conduite post-laboratoire avant la décision finale.',
      );
    }
  }

  private resolveStatus(current: ConsultationStatus, decision?: ConsultationDecision) {
    if (
      decision &&
      ['HOSPITALIZATION', 'DISCHARGE', 'COMPLETE', 'PRESCRIPTION', 'FOLLOW_UP'].includes(decision)
    ) {
      return ConsultationStatus.COMPLETED;
    }
    if (decision && ['LABORATORY', 'IMAGING'].includes(decision)) {
      return ConsultationStatus.WAITING;
    }
    if (decision && ['CONTINUE', 'TRANSFER'].includes(decision)) {
      return ConsultationStatus.IN_PROGRESS;
    }
    return current;
  }

  private resolveJourney(
    decision: ConsultationDecision | undefined,
    status: ConsultationStatus,
    awaitingLaboratory: boolean,
  ) {
    if (decision === 'LABORATORY' || awaitingLaboratory) return PatientJourneyStage.LABORATORY;
    if (decision === 'IMAGING') return PatientJourneyStage.IMAGING;
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
      HOSPITALIZATION:
        'Hospitalisation — admission à organiser; sortie administrative soumise au règlement du séjour',
      TRANSFER: 'Transfert vers un autre médecin',
      PRESCRIPTION: 'Prescription et retour à domicile',
      FOLLOW_UP: 'Suivi ambulatoire programmé',
      DISCHARGE: 'Ancienne décision de libération',
      COMPLETE: 'Consultation terminée',
    };
    return decision ? labels[decision] : undefined;
  }
}
