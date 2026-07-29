export interface VitalSignMetadata {
  respiratoryRate?: number;
  bloodGlucoseMgDl?: number;
  clinicalNotes?: string;
}

const PREFIX = 'HIS_VITALS:';

export function encodeVitalSignMetadata(input: VitalSignMetadata): string | undefined {
  const metadata = {
    respiratoryRate: input.respiratoryRate,
    bloodGlucoseMgDl: input.bloodGlucoseMgDl,
    clinicalNotes: input.clinicalNotes?.trim() || undefined,
  };
  if (Object.values(metadata).every((value) => value === undefined)) return undefined;
  return `${PREFIX}${JSON.stringify(metadata)}`;
}

export function decodeVitalSignMetadata(value?: string | null): VitalSignMetadata {
  if (!value) return {};
  if (!value.startsWith(PREFIX)) return { clinicalNotes: value };
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length)) as VitalSignMetadata;
    return {
      respiratoryRate:
        typeof parsed.respiratoryRate === 'number' ? parsed.respiratoryRate : undefined,
      bloodGlucoseMgDl:
        typeof parsed.bloodGlucoseMgDl === 'number' ? parsed.bloodGlucoseMgDl : undefined,
      clinicalNotes:
        typeof parsed.clinicalNotes === 'string' && parsed.clinicalNotes.trim()
          ? parsed.clinicalNotes.trim()
          : undefined,
    };
  } catch {
    return { clinicalNotes: value };
  }
}

export function presentVitalSign<T extends { notes?: string | null }>(row: T) {
  const metadata = decodeVitalSignMetadata(row.notes);
  return {
    ...row,
    notes: metadata.clinicalNotes,
    respiratoryRate: metadata.respiratoryRate,
    bloodGlucoseMgDl: metadata.bloodGlucoseMgDl,
  };
}
