import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ConsultationStatus,
  ExamStatus,
  PatientJourneyStage,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaboratoryBatchValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(requestGroupId: string, userId: string) {
    const reviewer = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
    if (!reviewer) throw new ForbiddenException('Profil de biologiste médical requis.');

    const exams = await this.prisma.examRequest.findMany({
      where: { requestGroupId },
      include: {
        patient: true,
        requestedByDoctor: { select: { userId: true } },
      },
      orderBy: { requestedAt: 'asc' },
    });
    if (!exams.length) throw new NotFoundException('Demande groupée de laboratoire introuvable.');

    const active = exams.filter((exam) => exam.status !== ExamStatus.CANCELLED);
    if (!active.length) throw new BadRequestException('Tous les examens de cette demande sont annulés.');
    const incomplete = active.filter(
      (exam) => exam.status !== ExamStatus.COMPLETED && exam.status !== ExamStatus.VALIDATED,
    );
    if (incomplete.length) {
      throw new BadRequestException(
        `La validation groupée est impossible : ${incomplete.length} résultat(s) ne sont pas encore complétés.`,
      );
    }
    if (active.some((exam) => exam.status === ExamStatus.COMPLETED && !exam.result?.trim())) {
      throw new BadRequestException('Chaque examen doit contenir un résultat avant la validation groupée.');
    }

    const pending = active.filter((exam) => exam.status === ExamStatus.COMPLETED);
    if (!pending.length) {
      throw new BadRequestException('Tous les résultats de cette demande sont déjà validés.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      await transaction.examRequest.updateMany({
        where: { id: { in: pending.map((exam) => exam.id) }, status: ExamStatus.COMPLETED },
        data: {
          status: ExamStatus.VALIDATED,
          validatedAt: now,
          validatedByLabTechId: reviewer.id,
          reviewComment: null,
        },
      });

      const consultationIds = [
        ...new Set(active.map((exam) => exam.consultationId).filter((id): id is string => Boolean(id))),
      ];
      let returnedToDoctor = false;
      for (const consultationId of consultationIds) {
        const remaining = await transaction.examRequest.count({
          where: {
            consultationId,
            status: { notIn: [ExamStatus.VALIDATED, ExamStatus.CANCELLED] },
          },
        });
        if (remaining > 0) continue;

        const consultation = await transaction.consultation.update({
          where: { id: consultationId },
          data: { status: ConsultationStatus.IN_PROGRESS, completedAt: null },
          select: { appointmentId: true },
        });
        if (consultation.appointmentId) {
          await transaction.appointment.update({
            where: { id: consultation.appointmentId },
            data: {
              status: AppointmentStatus.CHECKED_IN,
              journeyStage: PatientJourneyStage.RETURN_TO_DOCTOR,
              journeyUpdatedAt: now,
              doctorAcknowledgedAt: null,
            },
          });
          returnedToDoctor = true;
        }
      }

      const first = exams[0]!;
      const patientName = [first.patient.lastName, first.patient.postName, first.patient.firstName]
        .filter(Boolean)
        .join(' ');
      const recipients = await transaction.user.findMany({
        where: {
          isActive: true,
          OR: [
            { id: first.requestedByDoctor.userId },
            { role: { in: [Role.RECEPTIONIST, Role.SECRETARY] } },
            { additionalRoles: { hasSome: [Role.RECEPTIONIST, Role.SECRETARY] } },
          ],
        },
        select: { id: true },
      });
      const content = returnedToDoctor
        ? `Retour laboratoire : les ${active.length} résultat(s) de ${patientName} (${first.patient.medicalRecordNumber}) ont été validés ensemble. Le patient est replacé dans la file de son médecin.`
        : `Validation laboratoire : les ${active.length} résultat(s) de ${patientName} (${first.patient.medicalRecordNumber}) ont été confirmés ensemble.`;
      const notifications = recipients
        .filter((recipient) => recipient.id !== userId)
        .map((recipient) => ({ senderId: userId, receiverId: recipient.id, content }));
      if (notifications.length) await transaction.message.createMany({ data: notifications });

      return transaction.examRequest.findMany({
        where: { requestGroupId },
        include: {
          patient: true,
          requestedByDoctor: true,
          performedByLabTech: true,
          validatedByLabTech: true,
          careAuthorization: { include: { service: true, invoice: true } },
          document: {
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
          },
        },
        orderBy: { requestedAt: 'asc' },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
