import { Role } from '@prisma/client';

export const exportFormats = ['csv', 'xlsx', 'pdf'] as const;
export const importFormats = ['csv', 'xlsx'] as const;

export type ExportFormat = (typeof exportFormats)[number];
export type ImportFormat = (typeof importFormats)[number];

export type DataSetKey =
  | 'patients'
  | 'medications'
  | 'staff'
  | 'service-reports'
  | 'requisitions'
  | 'accounting'
  | 'laboratory'
  | 'invoices'
  | 'hospitalizations'
  | 'appointments'
  | 'consultations'
  | 'prescriptions'
  | 'department-stocks'
  | 'billable-services';

export type ColumnKind = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'enum';

export interface ExchangeColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  required?: boolean;
  aliases?: string[];
  values?: string[];
  description?: string;
}

export interface DataSetDefinition {
  key: DataSetKey;
  label: string;
  description: string;
  exportRoles: readonly Role[];
  importRoles: readonly Role[];
  columns: readonly ExchangeColumn[];
  importable: boolean;
  sample: Record<string, unknown>;
}

export interface ExportQuery {
  from?: string;
  to?: string;
  department?: string;
  status?: string;
  search?: string;
}

export interface TabularBranding {
  name: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoDataUrl?: string | null;
  accentColor?: string | null;
}

export interface TabularDocument {
  title: string;
  columns: readonly ExchangeColumn[];
  rows: Array<Record<string, unknown>>;
  metadata?: Array<{ label: string; value: string }>;
  branding?: TabularBranding;
}

export interface ParsedTabularFile {
  headers: string[];
  rows: Array<Record<string, string>>;
  format: ImportFormat;
}

export interface ImportRowResult {
  rowNumber: number;
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewResult {
  dataset: DataSetKey;
  fileName: string;
  format: ImportFormat;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  warningRows: number;
  columns: readonly ExchangeColumn[];
  rows: ImportRowResult[];
  canCommit: boolean;
  truncated?: boolean;
}
