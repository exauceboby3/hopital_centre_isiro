import { createHash } from 'node:crypto';

export const CLINICAL_REPORT_VERSION = 2;

export type ConsultationDecision =
  | 'CONTINUE'
  | 'LABORATORY'
  | 'IMAGING'
  | 'HOSPITALIZATION'
  | 'TRANSFER'
  | 'PRESCRIPTION'
  | 'FOLLOW_UP'
  | 'DISCHARGE'
  | 'COMPLETE';

export interface ClinicalReportSections {
  chiefComplaint?: string;
  presentIllnessHistory?: string;
  anamnesisComplements?: string;
  medicalHistory?: string;
  physicalExamination?: string;
  paraclinicalExams?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  decision?: ConsultationDecision;
  preLaboratoryLockedAt?: string;
  laboratoryInterpretation?: string;
  postLaboratoryDiagnosis?: string;
  postLaboratoryPlan?: string;
  postLaboratoryNotes?: string;
  amendmentReason?: string;
  amendedAt?: string;
  amendedById?: string;
}

export interface ClinicalReportEnvelope {
  version: number;
  sections: ClinicalReportSections;
}

export interface MedicalSignature {
  version: number;
  doctorUserId: string;
  doctorName: string;
  licenseNumber?: string;
  signedAt: string;
  hash: string;
}

const clean = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

export function decodeClinicalReport(value?: string | null): ClinicalReportEnvelope {
  if (!value) return { version: CLINICAL_REPORT_VERSION, sections: {} };
  try {
    const parsed = JSON.parse(value) as Partial<ClinicalReportEnvelope>;
    if (parsed && typeof parsed === 'object' && parsed.sections && typeof parsed.sections === 'object') {
      return {
        version: Number(parsed.version) || CLINICAL_REPORT_VERSION,
        sections: parsed.sections,
      };
    }
  } catch {
    // Compatibilité avec les anciens comptes rendus en texte libre.
  }
  return {
    version: CLINICAL_REPORT_VERSION,
    sections: { physicalExamination: value },
  };
}

export function mergeClinicalReport(
  current: string | null | undefined,
  changes: Partial<ClinicalReportSections>,
): string {
  const envelope = decodeClinicalReport(current);
  const normalized = Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [key, clean(value) ?? value]),
  ) as Partial<ClinicalReportSections>;
  return JSON.stringify({
    version: CLINICAL_REPORT_VERSION,
    sections: { ...envelope.sections, ...normalized },
  } satisfies ClinicalReportEnvelope);
}

export function decodeMedicalSignature(value?: string | null): MedicalSignature | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as MedicalSignature;
    if (parsed?.hash && parsed?.signedAt && parsed?.doctorUserId) return parsed;
  } catch {
    return null;
  }
  return null;
}

export function createMedicalSignature(input: {
  doctorUserId: string;
  doctorName: string;
  licenseNumber?: string | null;
  signedAt: Date;
  report: string;
}): MedicalSignature {
  const signedAt = input.signedAt.toISOString();
  const payload = JSON.stringify({
    doctorUserId: input.doctorUserId,
    doctorName: input.doctorName,
    licenseNumber: input.licenseNumber ?? undefined,
    signedAt,
    report: input.report,
  });
  return {
    version: 1,
    doctorUserId: input.doctorUserId,
    doctorName,
    licenseNumber: input.licenseNumber ?? undefined,
    signedAt,
    hash: createHash('sha256').update(payload).digest('hex'),
  };
}
