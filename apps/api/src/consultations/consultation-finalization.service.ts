import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, ExamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decodeClinicalReport } from './clinical-report';
import type { ConsultationDecision } from './clinical-report';

export const FINAL_CONSULTATION_DECISIONS = new Set<ConsultationDecision>([
  'PRESCRIPTION',
  'FOLLOW_UP',
  'COMPLETE',
  'HOSPITALIZATION',
  // Compatibilité avec les anciens dossiers déjà enregistrés.
  'DISCHARGE',
]);

export function assertLaboratoryResultsComplete(
  examRequests: ReadonlyArray<{ status: ExamStatus }>,
  actionLabel: string,
) {
  const pendingCount = examRequests.filter(
    (exam) => exam.status !== ExamStatus.VALIDATED && exam.status !== ExamStatus.CANCELLED,
  ).length;
  if (pendingCount > 0) {
    throw new BadRequestException(
      `${actionLabel} : ${pendingCount} résultat(s) de laboratoire sont encore attendus. Le patient doit rester dans le circuit laboratoire puis revenir chez le médecin.`,
    );
  }
}

export interface SignableConsultationSnapshot {
  status: ConsultationStatus;
  report: string | null;
  examRequests: ReadonlyArray<{ status: ExamStatus }>;
  prescriptions: ReadonlyArray<{ id: string }>;
}

export function assertCanSignConsultation(consultation: SignableConsultationSnapshot) {
  const report = decodeClinicalReport(consultation.report).sections;
  const required = [
    report.chiefComplaint,
    report.presentIllnessHistory,
    report.physicalExamination,
    report.diagnosis,
    report.treatmentPlan,
    report.decision,
  ];
  if (required.some((value) => !value?.trim())) {
    throw new BadRequestException(
      'Complétez la plainte, l’histoire de la maladie, l’examen physique, le diagnostic, la conduite thérapeutique et la décision finale avant de signer.',
    );
  }
  if (!report.decision || !FINAL_CONSULTATION_DECISIONS.has(report.decision)) {
    throw new BadRequestException(
      'Choisissez une décision finale : prescription, hospitalisation ou suivi ambulatoire avant de signer.',
    );
  }
  if (consultation.status !== ConsultationStatus.COMPLETED) {
    throw new BadRequestException(
      'La consultation doit être clôturée par une décision finale avant la signature.',
    );
  }

  assertLaboratoryResultsComplete(consultation.examRequests, 'Signature indisponible');

  if (consultation.examRequests.length > 0) {
    const postLaboratoryComplete = [
      report.laboratoryInterpretation,
      report.postLaboratoryDiagnosis,
      report.postLaboratoryPlan,
    ].every((value) => Boolean(value?.trim()));
    if (!postLaboratoryComplete) {
      throw new BadRequestException(
        'Complétez l’interprétation, le diagnostic réévalué et la conduite post-laboratoire avant de signer.',
      );
    }
  }

  if (report.decision === 'PRESCRIPTION' && consultation.prescriptions.length === 0) {
    throw new BadRequestException(
      'Créez l’ordonnance structurée et sa facture avant de signer une consultation conclue par prescription.',
    );
  }
}

@Injectable()
export class ConsultationFinalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanSign(consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        examRequests: { select: { status: true } },
        prescriptions: { select: { id: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');

    assertCanSignConsultation(consultation);
  }
}
