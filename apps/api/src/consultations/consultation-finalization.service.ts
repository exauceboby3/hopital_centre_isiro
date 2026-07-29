import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConsultationStatus, ExamStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decodeClinicalReport } from './clinical-report';

const finalDecisions = new Set(['PRESCRIPTION', 'DISCHARGE', 'COMPLETE', 'HOSPITALIZATION']);

@Injectable()
export class ConsultationFinalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanSign(consultationId: string) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      include: {
        examRequests: { select: { type: true, status: true } },
        prescriptions: { select: { id: true, number: true } },
      },
    });
    if (!consultation) throw new NotFoundException('Consultation introuvable.');

    const report = decodeClinicalReport(consultation.report).sections;
    if (!report.decision || !finalDecisions.has(report.decision)) {
      throw new BadRequestException(
        'Choisissez une décision finale : prescription, libération, conclusion ou hospitalisation avant de signer.',
      );
    }
    if (consultation.status !== ConsultationStatus.COMPLETED) {
      throw new BadRequestException(
        'La consultation doit être clôturée par une décision finale avant la signature.',
      );
    }

    const pendingExams = consultation.examRequests.filter(
      (exam) => exam.status !== ExamStatus.VALIDATED && exam.status !== ExamStatus.CANCELLED,
    );
    if (pendingExams.length) {
      throw new BadRequestException(
        `Signature indisponible : ${pendingExams.length} résultat(s) de laboratoire sont encore attendus.`,
      );
    }

    if (report.decision === 'PRESCRIPTION' && consultation.prescriptions.length === 0) {
      throw new BadRequestException(
        'Créez l’ordonnance structurée et sa facture avant de signer une consultation conclue par prescription.',
      );
    }
  }
}
