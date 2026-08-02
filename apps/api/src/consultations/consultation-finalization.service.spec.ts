import { BadRequestException } from '@nestjs/common';
import { ConsultationStatus, ExamStatus } from '@prisma/client';
import { mergeClinicalReport } from './clinical-report';
import { assertCanSignConsultation } from './consultation-finalization.service';

const completeReport = (decision: 'PRESCRIPTION' | 'DISCHARGE' | 'COMPLETE' | 'HOSPITALIZATION') =>
  mergeClinicalReport(null, {
    chiefComplaint: 'Fièvre',
    presentIllnessHistory: 'Depuis trois jours',
    physicalExamination: 'Patient conscient',
    diagnosis: 'Paludisme simple',
    treatmentPlan: 'Traitement et surveillance',
    decision,
  });

describe('assertCanSignConsultation', () => {
  it('refuse la signature si un résultat de laboratoire est en attente', () => {
    expect(() =>
      assertCanSignConsultation({
        status: ConsultationStatus.COMPLETED,
        report: completeReport('COMPLETE'),
        examRequests: [{ status: ExamStatus.COMPLETED }],
        prescriptions: [],
      }),
    ).toThrow(BadRequestException);
  });

  it('refuse une décision prescription sans ordonnance structurée', () => {
    expect(() =>
      assertCanSignConsultation({
        status: ConsultationStatus.COMPLETED,
        report: completeReport('PRESCRIPTION'),
        examRequests: [],
        prescriptions: [],
      }),
    ).toThrow('ordonnance structurée');
  });

  it('autorise une consultation complète et cohérente', () => {
    expect(() =>
      assertCanSignConsultation({
        status: ConsultationStatus.COMPLETED,
        report: completeReport('PRESCRIPTION'),
        examRequests: [],
        prescriptions: [{ id: 'rx-1' }],
      }),
    ).not.toThrow();
  });
});
