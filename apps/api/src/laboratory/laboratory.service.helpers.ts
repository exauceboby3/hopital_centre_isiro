import { BadRequestException } from '@nestjs/common';
import { CareAuthorizationStatus, ExamStatus, Prisma } from '@prisma/client';
import { CompleteExamDto } from './dto/complete-exam.dto';
import { decodeLabTemplate } from './lab-template-envelope';
import { LabResultField } from './lab-result-templates';
export const examInclude = {
  patient: true,
  requestedByDoctor: { include: { user: { select: { username: true } } } },
  performedByLabTech: { include: { user: { select: { username: true } } } },
  validatedByLabTech: { include: { user: { select: { username: true } } } },
  careAuthorization: { include: { service: true, invoice: { include: { payments: true } } } },
  document: {
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
  },
} satisfies Prisma.ExamRequestInclude;
export type ExamRow = Prisma.ExamRequestGetPayload<{ include: typeof examInclude }>;
type CatalogRow = Prisma.BillableServiceGetPayload<Record<string, never>>;

export function stripLabFinancialDetails<
  T extends {
    careAuthorization: {
      id: string;
      status: CareAuthorizationStatus;
      invoice: unknown;
      invoiceId: string;
      amount: Prisma.Decimal;
      service: { price: Prisma.Decimal } | null;
    } | null;
  },
>(row: T) {
  const { careAuthorization, ...exam } = row;
  if (!careAuthorization) return { ...exam, careAuthorization: null };
  const { invoice, invoiceId, amount, service, ...authorization } = careAuthorization;
  void invoice;
  void invoiceId;
  void amount;
  const clinicalService = service
    ? (() => {
        const { price, ...details } = service;
        void price;
        return details;
      })()
    : null;
  const clearedStatuses: CareAuthorizationStatus[] = [
    CareAuthorizationStatus.AUTHORIZED,
    CareAuthorizationStatus.WAIVED,
    CareAuthorizationStatus.CONSUMED,
  ];
  const inOrder = clearedStatuses.includes(careAuthorization.status);
  return {
    ...exam,
    careAuthorization: {
      ...authorization,
      service: clinicalService,
      paymentClearance: { inOrder, status: inOrder ? 'IN_ORDER' : 'TO_REGULARIZE' },
    },
  };
}
export function prepareLabResult(schema: LabResultField[], dto: CompleteExamDto) {
  if (!dto.resultValues?.length) {
    const legacy = dto.result?.trim();
    if (!legacy) throw new BadRequestException('Renseignez au moins une rubrique du résultat.');
    return {
      summary: legacy,
      data: {
        values: [{ key: schema[0]?.key ?? 'resultat', value: legacy }],
        ...(dto.conclusion?.trim() ? { conclusion: dto.conclusion.trim() } : {}),
      },
    };
  }
  const schemaByKey = new Map(schema.map((entry) => [entry.key, entry]));
  const submittedKeys = new Set<string>();
  const values = dto.resultValues
    .map((entry) => ({
      key: entry.key.trim().toLowerCase(),
      value: entry.value.trim(),
      ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
    }))
    .filter((entry) => entry.value || entry.note)
    .map((entry) => {
      if (!schemaByKey.has(entry.key)) {
        throw new BadRequestException(
          `La rubrique « ${entry.key} » ne fait pas partie de cet examen.`,
        );
      }
      if (submittedKeys.has(entry.key)) {
        throw new BadRequestException(`La rubrique « ${entry.key} » est envoyée plusieurs fois.`);
      }
      submittedKeys.add(entry.key);
      return entry;
    });
  const missing = schema.filter((entry) => entry.required && !submittedKeys.has(entry.key));
  if (missing.length) {
    throw new BadRequestException(
      `Complétez les rubriques obligatoires : ${missing.map((entry) => entry.label).join(', ')}.`,
    );
  }
  if (!values.length)
    throw new BadRequestException('Renseignez au moins une rubrique du résultat.');
  const lines = values.map((entry) => {
    const definition = schemaByKey.get(entry.key)!;
    return `${definition.label} : ${entry.value}${definition.unit ? ` ${definition.unit}` : ''}${entry.note ? ` — ${entry.note}` : ''}`;
  });
  if (dto.conclusion?.trim()) lines.push(`Conclusion : ${dto.conclusion.trim()}`);
  return {
    summary: lines.join('\n'),
    data: { values, ...(dto.conclusion?.trim() ? { conclusion: dto.conclusion.trim() } : {}) },
  };
}
export function presentLabExam(row: ExamRow) {
  const service = row.careAuthorization?.service;
  const template = decodeLabTemplate(service?.labResultTemplate, service?.code, service?.category);
  const authorizationStatus = row.careAuthorization?.status;
  const workflowStatus =
    row.status === ExamStatus.CANCELLED
      ? 'CANCELLED'
      : authorizationStatus === 'PENDING'
        ? 'PENDING_PAYMENT'
        : row.status === ExamStatus.REQUESTED
          ? 'PAID'
          : row.status === ExamStatus.IN_PROGRESS
            ? 'IN_PROGRESS'
            : row.status === ExamStatus.COMPLETED
              ? 'RESULT_ENTERED'
              : row.status === ExamStatus.VALIDATED
                ? 'VALIDATED'
                : 'IN_PROGRESS';
  return {
    ...stripLabFinancialDetails(row),
    workflowStatus,
    catalogMetadata: { specimenType: template.specimenType, method: template.method },
  };
}
export function presentLabCatalog(row: CatalogRow) {
  const template = decodeLabTemplate(row.labResultTemplate, row.code, row.category);
  return {
    ...row,
    specimenType: template.specimenType,
    method: template.method,
    resultFields: template.fields,
  };
}
export function asPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
