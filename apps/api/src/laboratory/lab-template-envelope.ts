import { LabResultField, normalizeLabResultTemplate } from './lab-result-templates';

export interface LabTemplateEnvelope {
  version: 1;
  specimenType?: string;
  method?: string;
  fields: LabResultField[];
}

export function decodeLabTemplate(value: unknown, code?: string | null, category?: string | null) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const candidate = value as Partial<LabTemplateEnvelope>;
    return {
      version: 1 as const,
      specimenType:
        typeof candidate.specimenType === 'string' && candidate.specimenType.trim()
          ? candidate.specimenType.trim()
          : undefined,
      method:
        typeof candidate.method === 'string' && candidate.method.trim()
          ? candidate.method.trim()
          : undefined,
      fields: normalizeLabResultTemplate(candidate.fields, code, category),
    };
  }
  return {
    version: 1 as const,
    fields: normalizeLabResultTemplate(value, code, category),
  };
}

export function encodeLabTemplate(input: {
  value: unknown;
  code?: string | null;
  category?: string | null;
  specimenType?: string | null;
  method?: string | null;
}): LabTemplateEnvelope {
  const current = decodeLabTemplate(input.value, input.code, input.category);
  return {
    version: 1,
    specimenType: input.specimenType?.trim() || current.specimenType,
    method: input.method?.trim() || current.method,
    fields: current.fields,
  };
}
