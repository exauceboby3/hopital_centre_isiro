import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  BillableServiceType,
  ConsultationStatus,
  DepartmentReportStatus,
  ExamStatus,
  HospitalizationStatus,
  InvoiceStatus,
  Prisma,
  PrescriptionStatus,
  RequisitionPriority,
  RequisitionStatus,
  Role,
  Sex,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthenticatedUser, hasAnyRole } from '../common/authenticated-user';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { dataSetDefinitions, dataSetKeys } from './data-exchange.definitions';
import {
  DataSetDefinition,
  DataSetKey,
  ExportFormat,
  ExportQuery,
  ImportPreviewResult,
  ImportRowResult,
  ParsedTabularFile,
  TabularDocument,
} from './data-exchange.types';
import { TabularCodecService } from './tabular-codec.service';

interface UploadedTabularFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface ExportedFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

const clinicianRoles = new Set<Role>([Role.DOCTOR, Role.SURGEON, Role.MIDWIFE]);
const clinicalDepartments = new Set([
  'URGENCES',
  'MEDECINE_INTERNE',
  'PEDIATRIE',
  'GYNECO_OBSTETRIQUE',
  'MATERNITE',
  'CHIRURGIE',
]);

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value).trim();
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value).trim();
}

function nullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized || null;
}

function fullName(person: {
  lastName?: string | null;
  postName?: string | null;
  firstName?: string | null;
} | null | undefined): string {
  if (!person) return '';
  return [person.lastName, person.postName, person.firstName].filter(Boolean).join(' ');
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dateBounds(query: ExportQuery): { gte?: Date; lte?: Date } | undefined {
  const gte = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
  const lte = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;
  return gte || lte ? { gte, lte } : undefined;
}

function jsonObject(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}


function enumValue<T extends Record<string, string>>(
  raw: string | undefined,
  enumeration: T,
  label: string,
): T[keyof T] | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toUpperCase();
  const values = Object.values(enumeration);
  if (!values.includes(normalized)) {
    throw new BadRequestException(
      `${label} invalide. Valeurs acceptées: ${values.join(', ')}.`,
    );
  }
  return normalized as T[keyof T];
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(clean(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

@Injectable()
export class DataExchangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly codec: TabularCodecService,
  ) {}

  catalog(user: AuthenticatedUser) {
    return dataSetKeys.flatMap((key) => {
      const definition = this.definition(key);
      const canExport = hasAnyRole(user, definition.exportRoles);
      const canImport = definition.importable && hasAnyRole(user, definition.importRoles);
      if (!canExport && !canImport) return [];
      return [
        {
          key: definition.key,
          label: definition.label,
          description: definition.description,
          canExport,
          canImport,
          exportFormats: canExport ? ['pdf', 'xlsx', 'csv'] : [],
          importFormats: canImport ? ['xlsx', 'csv'] : [],
          columns: definition.columns,
        },
      ];
    });
  }

  async export(
    dataset: string,
    format: string,
    query: ExportQuery,
    user: AuthenticatedUser,
  ): Promise<ExportedFile> {
    const definition = this.definition(dataset);
    const normalizedFormat = this.exportFormat(format);
    this.assertRole(user, definition.exportRoles, 'exporter ces données');
    const document = await this.document(definition, query, user);
    const buffer = await this.codec.encode(document, normalizedFormat);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${definition.key}-${stamp}.${normalizedFormat}`;
    await this.audit(user.id, 'DATA_EXPORTED', definition.key, {
      format: normalizedFormat,
      rows: document.rows.length,
      query,
    });
    return { buffer, fileName, mimeType: MIME_TYPES[normalizedFormat] };
  }

  async template(
    dataset: string,
    format: string,
    user: AuthenticatedUser,
  ): Promise<ExportedFile> {
    const definition = this.definition(dataset);
    if (!definition.importable) {
      throw new BadRequestException('Ce jeu de données est disponible uniquement en export.');
    }
    const normalizedFormat = this.importFormat(format);
    this.assertRole(user, definition.importRoles, 'télécharger ce modèle');
    const branding = await this.branding();
    const document: TabularDocument = {
      title: `Modèle d'import - ${definition.label}`,
      columns: definition.columns,
      rows: [definition.sample],
      metadata: [
        { label: 'Instruction', value: 'Ne modifiez pas les intitulés de colonnes.' },
        { label: 'Limite', value: '5 000 lignes et 10 Mo par fichier.' },
      ],
      branding,
    };
    const buffer = await this.codec.encode(document, normalizedFormat);
    return {
      buffer,
      fileName: `modele-${definition.key}.${normalizedFormat}`,
      mimeType: MIME_TYPES[normalizedFormat],
    };
  }

  async preview(dataset: string, file: UploadedTabularFile, user: AuthenticatedUser) {
    const definition = this.definition(dataset);
    this.assertImportable(definition, user);
    const parsed = this.codec.parse(file.originalname, file.mimetype, file.buffer);
    return this.analyze(definition, parsed, file.originalname, user);
  }

  async commit(dataset: string, file: UploadedTabularFile, user: AuthenticatedUser) {
    const definition = this.definition(dataset);
    this.assertImportable(definition, user);
    const parsed = this.codec.parse(file.originalname, file.mimetype, file.buffer);
    const preview = await this.analyze(definition, parsed, file.originalname, user);
    if (!preview.canCommit) {
      const messages = preview.rows
        .flatMap((row) => row.errors.map((error) => `Ligne ${row.rowNumber}: ${error}`))
        .slice(0, 20);
      throw new BadRequestException({
        code: 'IMPORT_VALIDATION_FAILED',
        message: `Import refusé: ${preview.invalidRows} ligne(s) invalide(s).`,
        errors: messages,
      });
    }
    const values = preview.rows.map((row) => row.values);
    const result = await this.commitRows(definition.key, values, user);
    await this.audit(user.id, 'DATA_IMPORTED', definition.key, {
      fileName: file.originalname,
      format: preview.format,
      rows: preview.totalRows,
      created: result.created,
      updated: result.updated,
    });
    return {
      dataset: definition.key,
      fileName: file.originalname,
      importedRows: preview.totalRows,
      ...result,
    };
  }

  private definition(value: string): DataSetDefinition {
    const definition = dataSetDefinitions.get(value as DataSetKey);
    if (!definition) throw new NotFoundException('Jeu de données inconnu.');
    return definition;
  }

  private exportFormat(value: string): ExportFormat {
    if (!['csv', 'xlsx', 'pdf'].includes(value)) {
      throw new BadRequestException('Format d’export invalide. Utilisez PDF, Excel ou CSV.');
    }
    return value as ExportFormat;
  }

  private importFormat(value: string): 'csv' | 'xlsx' {
    if (!['csv', 'xlsx'].includes(value)) {
      throw new BadRequestException('Format de modèle invalide. Utilisez Excel ou CSV.');
    }
    return value as 'csv' | 'xlsx';
  }

  private assertRole(user: AuthenticatedUser, roles: readonly Role[], action: string) {
    if (!hasAnyRole(user, roles)) {
      throw new ForbiddenException(`Votre rôle ne permet pas de ${action}.`);
    }
  }

  private assertImportable(definition: DataSetDefinition, user: AuthenticatedUser) {
    if (!definition.importable) {
      throw new BadRequestException(
        'L’import est désactivé pour les données cliniques ou financières sensibles de ce module.',
      );
    }
    this.assertRole(user, definition.importRoles, 'importer ces données');
  }

  private async branding() {
    const profile = await this.prisma.hospitalProfile.findUnique({ where: { id: 'main' } });
    return {
      name: profile?.name ?? "Centre Hospitalier d'Isiro",
      legalName: profile?.legalName,
      address: profile?.address,
      phone: profile?.phone,
      email: profile?.email,
      website: profile?.website ?? 'https://hopitalcentreisiro.online',
      logoDataUrl: profile?.logoDataUrl,
      accentColor: profile?.documentAccentColor,
    };
  }

  private async document(
    definition: DataSetDefinition,
    query: ExportQuery,
    user: AuthenticatedUser,
  ): Promise<TabularDocument> {
    const rows = await this.exportRows(definition.key, query, user);
    const columns =
      definition.key === 'staff'
        ? definition.columns.filter((column) => column.key !== 'password')
        : definition.columns;
    return {
      title: definition.label,
      columns,
      rows,
      metadata: [
        { label: 'Domaine', value: 'hopitalcentreisiro.online' },
        { label: 'Lignes', value: String(rows.length) },
        { label: 'Généré le', value: new Date().toLocaleString('fr-CD') },
      ],
      branding: await this.branding(),
    };
  }

  private async exportRows(
    dataset: DataSetKey,
    query: ExportQuery,
    user: AuthenticatedUser,
  ): Promise<Array<Record<string, unknown>>> {
    const search = query.search?.trim();
    const dates = dateBounds(query);
    const scopedDepartments = this.exportDepartmentsForUser(user, query.department);
    switch (dataset) {
      case 'patients': {
        const rows = await this.prisma.patient.findMany({
          where: {
            archivedAt: null,
            OR: search
              ? [
                  { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                  { postName: { contains: search, mode: 'insensitive' } },
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ]
              : undefined,
          },
          orderBy: { createdAt: 'desc' },
          take: 10_000,
        });
        return rows.map((row) => ({
          ...row,
          dateOfBirth: row.dateOfBirth?.toISOString().slice(0, 10) ?? '',
        }));
      }
      case 'medications': {
        const rows = await this.prisma.medication.findMany({
          where: search
            ? {
                OR: [
                  { code: { contains: search, mode: 'insensitive' } },
                  { name: { contains: search, mode: 'insensitive' } },
                ],
              }
            : undefined,
          orderBy: { name: 'asc' },
          take: 10_000,
        });
        return rows.map((row) => ({ ...row, unitPrice: Number(row.unitPrice) }));
      }
      case 'staff': {
        const rows = await this.prisma.user.findMany({
          where: {
            role: { notIn: [Role.SUPER_ADMIN, Role.ADMIN] },
            username: search ? { contains: search, mode: 'insensitive' } : undefined,
          },
          include: {
            doctorProfile: true,
            nurseProfile: true,
            secretaryProfile: true,
            labProfile: true,
            staffProfile: true,
          },
          orderBy: { username: 'asc' },
          take: 10_000,
        });
        return rows.map((row) => {
          const profile =
            row.doctorProfile ??
            row.nurseProfile ??
            row.secretaryProfile ??
            row.labProfile ??
            row.staffProfile;
          return {
            username: row.username,
            role: row.role,
            lastName: profile?.lastName ?? '',
            postName: profile?.postName ?? '',
            firstName: profile?.firstName ?? '',
            specialty:
              row.doctorProfile?.specialty ??
              row.nurseProfile?.specialty ??
              row.labProfile?.specialty ??
              row.staffProfile?.specialty ??
              '',
            grade: row.doctorProfile?.grade ?? row.staffProfile?.grade ?? '',
            licenseNumber: row.doctorProfile?.licenseNumber ?? '',
            educationLevel: row.secretaryProfile?.educationLevel ?? '',
            phone: profile?.phone ?? '',
            address: profile?.address ?? '',
            isActive: row.isActive,
          };
        });
      }
      case 'service-reports': {
        const rows = await this.prisma.departmentDailyReport.findMany({
          where: {
            department: scopedDepartments
              ? { in: scopedDepartments, mode: 'insensitive' }
              : undefined,
            status: query.status
              ? (enumValue(query.status, DepartmentReportStatus, 'Statut du rapport'))
              : undefined,
            businessDate: dates,
          },
          include: { items: { orderBy: { itemName: 'asc' } } },
          orderBy: [{ businessDate: 'desc' }, { department: 'asc' }],
          take: 5_000,
        });
        return rows.flatMap((report) => {
          const metrics = jsonObject(report.metrics);
          const items = report.items.length ? report.items : [null];
          return items.map((item) => ({
            department: report.department,
            businessDate: report.businessDate.toISOString().slice(0, 10),
            shift: report.shift ?? '',
            newAdmissions: report.newAdmissions,
            hospitalized: report.hospitalized,
            ambulatory: report.ambulatory,
            MIH: metrics.MIH ?? 0,
            MIF: metrics.MIF ?? 0,
            PED: metrics.PED ?? 0,
            GO: metrics.GO ?? 0,
            MATERNITE: metrics.MATERNITE ?? 0,
            CHIRURGIE: metrics.CHIRURGIE ?? 0,
            itemName: item?.itemName ?? '',
            unit: item?.unit ?? '',
            openingStock: item?.openingStock ?? 0,
            receivedQuantity: item?.receivedQuantity ?? 0,
            pendingOrder: item?.pendingOrder ?? 0,
            usedQuantity: item?.usedQuantity ?? 0,
            returnedQuantity: item?.returnedQuantity ?? 0,
            lostQuantity: item?.lostQuantity ?? 0,
            unitCost: Number(item?.unitCost ?? 0),
            observations: item?.observations ?? report.observations ?? '',
          }));
        });
      }
      case 'requisitions': {
        const rows = await this.prisma.internalRequisition.findMany({
          where: {
            department: scopedDepartments
              ? { in: scopedDepartments, mode: 'insensitive' }
              : undefined,
            status: query.status
              ? (enumValue(query.status, RequisitionStatus, 'Statut de la réquisition'))
              : undefined,
            requestedAt: dates,
          },
          include: { items: { orderBy: { itemName: 'asc' } } },
          orderBy: { requestedAt: 'desc' },
          take: 5_000,
        });
        return rows.flatMap((row) =>
          row.items.map((item) => ({
            group: row.reference,
            department: row.department,
            priority: row.priority,
            reason: row.reason,
            itemName: item.itemName,
            unit: item.unit ?? '',
            quantityRequested: item.quantityRequested,
            observations: item.observations ?? '',
          })),
        );
      }
      case 'accounting': {
        const reports = await this.prisma.departmentDailyReport.findMany({
          where: {
            department: scopedDepartments
              ? { in: scopedDepartments, mode: 'insensitive' }
              : undefined,
            businessDate: dates,
          },
          include: { items: true },
          orderBy: [{ businessDate: 'desc' }, { department: 'asc' }],
          take: 5_000,
        });
        return reports.map((report) => {
          const sum = (selector: (item: (typeof report.items)[number]) => number) =>
            report.items.reduce((total, item) => total + selector(item), 0);
          const openingValue = sum((item) => item.openingStock * Number(item.unitCost ?? 0));
          const receivedValue = sum(
            (item) => item.receivedQuantity * Number(item.unitCost ?? 0),
          );
          const returnedValue = sum(
            (item) => item.returnedQuantity * Number(item.unitCost ?? 0),
          );
          const usedValue = sum((item) => item.usedQuantity * Number(item.unitCost ?? 0));
          const lostValue = sum((item) => item.lostQuantity * Number(item.unitCost ?? 0));
          const closingValue = sum((item) => item.closingStock * Number(item.unitCost ?? 0));
          return {
            businessDate: report.businessDate.toISOString().slice(0, 10),
            department: report.department,
            shift: report.shift ?? '',
            patientCount: report.serviceTotal,
            openingValue,
            receivedValue,
            returnedValue,
            usedValue,
            lostValue,
            closingValue,
            variance:
              closingValue -
              (openingValue + receivedValue + returnedValue - usedValue - lostValue),
          };
        });
      }
      case 'laboratory': {
        const rows = await this.prisma.examRequest.findMany({
          where: {
            requestedAt: dates,
            status: query.status
              ? (enumValue(query.status, ExamStatus, 'Statut de laboratoire'))
              : undefined,
            OR: search
              ? [
                  { patient: { medicalRecordNumber: { contains: search, mode: 'insensitive' } } },
                  { patient: { lastName: { contains: search, mode: 'insensitive' } } },
                  { type: { contains: search, mode: 'insensitive' } },
                ]
              : undefined,
          },
          include: {
            patient: true,
            requestedByDoctor: true,
            performedByLabTech: true,
            validatedByLabTech: true,
          },
          orderBy: { requestedAt: 'desc' },
          take: 10_000,
        });
        return rows.map((row) => ({
          requestedAt: row.requestedAt,
          medicalRecordNumber: row.patient.medicalRecordNumber,
          patientName: fullName(row.patient),
          type: row.type,
          status: row.status,
          requester: fullName(row.requestedByDoctor),
          performer: fullName(row.performedByLabTech),
          validator: fullName(row.validatedByLabTech),
          result: row.result ?? (row.resultData ? JSON.stringify(row.resultData) : ''),
          observations: row.observations ?? '',
        }));
      }
      case 'invoices': {
        const rows = await this.prisma.invoice.findMany({
          where: {
            issuedAt: dates,
            status: query.status
              ? (enumValue(query.status, InvoiceStatus, 'Statut de facture'))
              : undefined,
            OR: search
              ? [
                  { number: { contains: search, mode: 'insensitive' } },
                  { patient: { medicalRecordNumber: { contains: search, mode: 'insensitive' } } },
                  { patient: { lastName: { contains: search, mode: 'insensitive' } } },
                ]
              : undefined,
          },
          include: { patient: true, items: true, payments: true },
          orderBy: { issuedAt: 'desc' },
          take: 10_000,
        });
        return rows.flatMap((invoice) => {
          const paidAmount = invoice.payments.reduce(
            (total, payment) => total + Number(payment.amount),
            0,
          );
          const items = invoice.items.length ? invoice.items : [null];
          return items.map((item) => ({
            number: invoice.number,
            issuedAt: invoice.issuedAt,
            medicalRecordNumber: invoice.patient.medicalRecordNumber,
            patientName: fullName(invoice.patient),
            status: invoice.status,
            description: item?.description ?? '',
            quantity: item?.quantity ?? 0,
            unitPrice: Number(item?.unitPrice ?? 0),
            lineTotal: Number(item?.total ?? 0),
            invoiceTotal: Number(invoice.total),
            paidAmount,
            balance: Number(invoice.total) - paidAmount,
          }));
        });
      }
      case 'hospitalizations': {
        const rows = await this.prisma.hospitalization.findMany({
          where: {
            admittedAt: dates,
            status: query.status
              ? (enumValue(query.status, HospitalizationStatus, 'Statut d’hospitalisation'))
              : undefined,
            patient: search
              ? {
                  OR: [
                    { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : undefined,
          },
          include: { patient: true, doctor: true, bed: { include: { room: true } } },
          orderBy: { admittedAt: 'desc' },
          take: 10_000,
        });
        return rows.map((row) => ({
          medicalRecordNumber: row.patient.medicalRecordNumber,
          patientName: fullName(row.patient),
          doctor: fullName(row.doctor),
          room: row.bed.room.name,
          bed: row.bed.code,
          reason: row.reason,
          status: row.status,
          admittedAt: row.admittedAt,
          expectedDischargeAt: row.expectedDischargeAt ?? '',
          dischargedAt: row.dischargedAt ?? '',
        }));
      }
      case 'appointments': {
        const rows = await this.prisma.appointment.findMany({
          where: {
            scheduledAt: dates,
            status: query.status
              ? (enumValue(query.status, AppointmentStatus, 'Statut de rendez-vous'))
              : undefined,
            service: query.department
              ? { equals: query.department.trim(), mode: 'insensitive' }
              : undefined,
            patient: search
              ? {
                  OR: [
                    { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : undefined,
          },
          include: { patient: true, doctor: true },
          orderBy: { scheduledAt: 'desc' },
          take: 10_000,
        });
        return rows.map((row) => ({
          scheduledAt: row.scheduledAt,
          medicalRecordNumber: row.patient.medicalRecordNumber,
          patientName: fullName(row.patient),
          doctor: fullName(row.doctor),
          service: row.service,
          reason: row.reason ?? '',
          status: row.status,
          journeyStage: row.journeyStage,
        }));
      }
      case 'consultations': {
        const rows = await this.prisma.consultation.findMany({
          where: {
            createdAt: dates,
            status: query.status
              ? (enumValue(query.status, ConsultationStatus, 'Statut de consultation'))
              : undefined,
            patient: search
              ? {
                  OR: [
                    { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : undefined,
          },
          include: { patient: true, doctor: true },
          orderBy: { createdAt: 'desc' },
          take: 10_000,
        });
        return rows.map((row) => ({
          createdAt: row.createdAt,
          medicalRecordNumber: row.patient.medicalRecordNumber,
          patientName: fullName(row.patient),
          doctor: fullName(row.doctor),
          status: row.status,
          reason: row.reason,
          report: row.report ?? '',
          orientation: row.orientation ?? '',
          startedAt: row.startedAt ?? '',
          completedAt: row.completedAt ?? '',
        }));
      }
      case 'prescriptions': {
        const rows = await this.prisma.prescription.findMany({
          where: {
            prescribedAt: dates,
            status: query.status
              ? (enumValue(query.status, PrescriptionStatus, 'Statut d’ordonnance'))
              : undefined,
            patient: search
              ? {
                  OR: [
                    { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
                    { lastName: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : undefined,
          },
          include: { patient: true, prescribedBy: true, items: true },
          orderBy: { prescribedAt: 'desc' },
          take: 10_000,
        });
        return rows.flatMap((row) =>
          row.items.map((item) => ({
            number: row.number,
            issuedAt: row.prescribedAt,
            medicalRecordNumber: row.patient.medicalRecordNumber,
            patientName: fullName(row.patient),
            prescriber: row.prescribedBy.username,
            status: row.status,
            medicationName: item.medicationName,
            availability: item.availability,
            dosage: item.dosage,
            frequency: item.frequency,
            route: item.route,
            durationDays: item.durationDays,
            quantity: item.quantity,
            dispensedQuantity: item.dispensedQuantity,
          })),
        );
      }
      case 'department-stocks': {
        const rows = await this.prisma.departmentStock.findMany({
          where: {
            department: scopedDepartments
              ? { in: scopedDepartments, mode: 'insensitive' }
              : undefined,
            medication: search
              ? {
                  OR: [
                    { code: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } },
                  ],
                }
              : undefined,
          },
          include: { medication: true },
          orderBy: [{ department: 'asc' }, { medication: { name: 'asc' } }],
          take: 10_000,
        });
        return rows.map((row) => ({
          department: row.department,
          code: row.medication.code,
          medicationName: row.medication.name,
          quantity: row.quantity,
          minimumQuantity: row.minimumQuantity,
          updatedAt: row.updatedAt,
        }));
      }
      case 'billable-services': {
        const rows = await this.prisma.billableService.findMany({
          where: search
            ? {
                OR: [
                  { code: { contains: search, mode: 'insensitive' } },
                  { name: { contains: search, mode: 'insensitive' } },
                  { category: { contains: search, mode: 'insensitive' } },
                ],
              }
            : undefined,
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          take: 10_000,
        });
        return rows.map((row) => ({ ...row, price: Number(row.price) }));
      }
    }
  }

  private async analyze(
    definition: DataSetDefinition,
    parsed: ParsedTabularFile,
    fileName: string,
    user: AuthenticatedUser,
  ): Promise<ImportPreviewResult> {
    const headerMap = new Map<string, string>();
    for (const column of definition.columns) {
      for (const alias of [column.key, column.label, ...(column.aliases ?? [])]) {
        headerMap.set(normalizeHeader(alias), column.key);
      }
    }
    const mappedHeaders = new Map<string, string>();
    for (const header of parsed.headers) {
      const mapped = headerMap.get(normalizeHeader(header));
      if (mapped && !mappedHeaders.has(mapped)) mappedHeaders.set(mapped, header);
    }
    const missing = definition.columns
      .filter((column) => column.required && !mappedHeaders.has(column.key))
      .map((column) => column.label);
    if (missing.length) {
      throw new BadRequestException(`Colonnes obligatoires absentes: ${missing.join(', ')}.`);
    }

    const rows: ImportRowResult[] = parsed.rows.map((source, index) => {
      const values: Record<string, unknown> = {};
      const errors: string[] = [];
      const warnings: string[] = [];
      for (const column of definition.columns) {
        const header = mappedHeaders.get(column.key);
        const raw = header ? source[header] ?? '' : '';
        const parsedValue = this.parseValue(column, raw, errors);
        values[column.key] = parsedValue;
        if (column.required && (parsedValue === null || parsedValue === '')) {
          errors.push(`${column.label} est obligatoire.`);
        }
      }
      this.validateRow(definition.key, values, errors, warnings, user);
      return { rowNumber: index + 2, values, errors, warnings };
    });
    await this.validateAgainstDatabase(definition.key, rows);
    const invalidRows = rows.filter((row) => row.errors.length).length;
    const warningRows = rows.filter((row) => row.warnings.length).length;
    return {
      dataset: definition.key,
      fileName,
      format: parsed.format,
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      warningRows,
      columns: definition.columns,
      rows,
      canCommit: rows.length > 0 && invalidRows === 0,
      truncated: false,
    };
  }

  private parseValue(
    column: DataSetDefinition['columns'][number],
    rawValue: string,
    errors: string[],
  ): unknown {
    const raw = rawValue.trim();
    if (!raw) return null;
    if (column.kind === 'string') return raw;
    if (column.kind === 'integer' || column.kind === 'number') {
      const normalized = raw.replace(/\s/g, '').replace(',', '.');
      const number = Number(normalized);
      if (!Number.isFinite(number) || (column.kind === 'integer' && !Number.isInteger(number))) {
        errors.push(`${column.label} doit être un ${column.kind === 'integer' ? 'nombre entier' : 'nombre'}.`);
        return null;
      }
      return number;
    }
    if (column.kind === 'boolean') {
      const normalized = normalizeHeader(raw);
      if (['oui', 'true', '1', 'actif', 'active'].includes(normalized)) return true;
      if (['non', 'false', '0', 'inactif', 'inactive'].includes(normalized)) return false;
      errors.push(`${column.label} doit contenir Oui/Non ou Vrai/Faux.`);
      return null;
    }
    if (column.kind === 'date') {
      if (/^\d+(\.\d+)?$/.test(raw)) {
        const serial = Number(raw);
        if (serial > 1 && serial < 100_000) {
          const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
          return date.toISOString().slice(0, 10);
        }
      }
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        errors.push(`${column.label} doit être une date valide.`);
        return null;
      }
      return date.toISOString().slice(0, 10);
    }
    const normalizedEnum = normalizeHeader(raw).replaceAll(' ', '_').toUpperCase();
    const special =
      column.key === 'sex'
        ? ({ HOMME: 'MALE', MASCULIN: 'MALE', FEMME: 'FEMALE', FEMININ: 'FEMALE' }[
            normalizedEnum
          ] ?? normalizedEnum)
        : normalizedEnum;
    if (!column.values?.includes(special)) {
      errors.push(`${column.label} doit être l’une des valeurs: ${column.values?.join(', ')}.`);
      return null;
    }
    return special;
  }

  private validateRow(
    dataset: DataSetKey,
    values: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    user: AuthenticatedUser,
  ) {
    const nonNegative = (...keys: string[]) => {
      for (const key of keys) {
        if (typeof values[key] === 'number' && values[key] < 0) {
          errors.push(`${key} ne peut pas être négatif.`);
        }
      }
    };
    if (dataset === 'patients') {
      if (clean(values.lastName).length < 2) errors.push('Le nom doit contenir au moins 2 caractères.');
      const birth = asDate(values.dateOfBirth);
      if (birth && birth > new Date()) errors.push('La date de naissance ne peut pas être future.');
    }
    if (dataset === 'medications') {
      nonNegative('stockQuantity', 'minimumStock', 'unitPrice');
      if (clean(values.code).length < 2) errors.push('Le code du médicament est trop court.');
      if (clean(values.name).length < 2) errors.push('La désignation est trop courte.');
    }
    if (dataset === 'staff') {
      if (clean(values.username).length < 3) errors.push("Le nom d'utilisateur est trop court.");
      if (clean(values.lastName).length < 2) errors.push('Le nom est trop court.');
      const role = values.role as Role | null;
      if (role && clinicianRoles.has(role) && clean(values.specialty).length < 2) {
        errors.push('La spécialité est obligatoire pour un praticien.');
      }
    }
    if (dataset === 'service-reports') {
      nonNegative(
        'newAdmissions',
        'hospitalized',
        'ambulatory',
        'MIH',
        'MIF',
        'PED',
        'GO',
        'MATERNITE',
        'CHIRURGIE',
        'openingStock',
        'receivedQuantity',
        'pendingOrder',
        'usedQuantity',
        'returnedQuantity',
        'lostQuantity',
        'unitCost',
      );
      const closing =
        Number(values.openingStock ?? 0) +
        Number(values.receivedQuantity ?? 0) +
        Number(values.returnedQuantity ?? 0) -
        Number(values.usedQuantity ?? 0) -
        Number(values.lostQuantity ?? 0);
      if (closing < 0) errors.push('Le stock final calculé est négatif.');
      this.assertDepartmentForUser(clean(values.department), user, errors);
    }
    if (dataset === 'requisitions') {
      nonNegative('quantityRequested');
      if (Number(values.quantityRequested ?? 0) < 1) {
        errors.push('La quantité demandée doit être supérieure à zéro.');
      }
      if (clean(values.reason).length < 5) errors.push('Le motif général est trop court.');
      this.assertDepartmentForUser(clean(values.department), user, errors);
    }
    if (dataset === 'billable-services') {
      nonNegative('price');
      if (clean(values.code).length < 2) errors.push('Le code du service est trop court.');
    }
    if (values.medicalRecordNumber && dataset === 'patients') {
      warnings.push('Un numéro de dossier renseigné est réservé à la détection des doublons.');
    }
  }

  private exportDepartmentsForUser(
    user: AuthenticatedUser,
    requested?: string,
  ): string[] | undefined {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT])) {
      return requested?.trim() ? [requested.trim().toUpperCase()] : undefined;
    }
    const roles = new Set([user.role, ...(user.additionalRoles ?? [])]);
    const permitted = new Set<string>();
    if (roles.has(Role.HR)) permitted.add('RESSOURCES_HUMAINES');
    if (roles.has(Role.NURSE)) permitted.add('NURSING');
    if (roles.has(Role.PHARMACIST) || roles.has(Role.STOREKEEPER)) permitted.add('PHARMACIE');
    if (roles.has(Role.LAB_TECHNICIAN) || roles.has(Role.MEDICAL_BIOLOGIST)) {
      permitted.add('LABORATOIRE');
    }
    if (roles.has(Role.RADIOLOGIST)) permitted.add('IMAGERIE');
    if (roles.has(Role.RECEPTIONIST) || roles.has(Role.SECRETARY)) permitted.add('RECEPTION');
    if (roles.has(Role.CASHIER)) permitted.add('CAISSE');
    if ([Role.DOCTOR, Role.SURGEON, Role.MIDWIFE].some((role) => roles.has(role))) {
      clinicalDepartments.forEach((department) => permitted.add(department));
    }
    const requestedDepartment = requested?.trim().toUpperCase();
    if (requestedDepartment && !permitted.has(requestedDepartment)) {
      throw new ForbiddenException(
        `Votre rôle ne permet pas d’exporter les données du département ${requestedDepartment}.`,
      );
    }
    return requestedDepartment ? [requestedDepartment] : [...permitted];
  }

  private assertDepartmentForUser(
    department: string,
    user: AuthenticatedUser,
    errors: string[],
  ) {
    if (hasAnyRole(user, [Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT])) return;
    const roles = new Set([user.role, ...(user.additionalRoles ?? [])]);
    const permitted = new Set<string>();
    if (roles.has(Role.HR)) permitted.add('RESSOURCES_HUMAINES');
    if (roles.has(Role.NURSE)) permitted.add('NURSING');
    if (roles.has(Role.PHARMACIST) || roles.has(Role.STOREKEEPER)) permitted.add('PHARMACIE');
    if (roles.has(Role.LAB_TECHNICIAN) || roles.has(Role.MEDICAL_BIOLOGIST)) {
      permitted.add('LABORATOIRE');
    }
    if (roles.has(Role.RADIOLOGIST)) permitted.add('IMAGERIE');
    if (roles.has(Role.RECEPTIONIST) || roles.has(Role.SECRETARY)) permitted.add('RECEPTION');
    if (roles.has(Role.CASHIER)) permitted.add('CAISSE');
    if ([Role.DOCTOR, Role.SURGEON, Role.MIDWIFE].some((role) => roles.has(role))) {
      clinicalDepartments.forEach((item) => permitted.add(item));
    }
    if (!permitted.has(department.toUpperCase())) {
      errors.push(`Votre rôle ne peut pas importer un rapport pour le département ${department}.`);
    }
  }

  private async validateAgainstDatabase(dataset: DataSetKey, rows: ImportRowResult[]) {
    const duplicate = (key: string, label: string) => {
      const seen = new Map<string, number>();
      for (const row of rows) {
        const value = clean(row.values[key]).toLocaleLowerCase('fr');
        if (!value) continue;
        const previous = seen.get(value);
        if (previous) {
          row.errors.push(`${label} est dupliqué dans le fichier (première occurrence ligne ${previous}).`);
        } else seen.set(value, row.rowNumber);
      }
    };
    if (dataset === 'patients') {
      duplicate('medicalRecordNumber', 'Le numéro de dossier');
      const numbers = rows.map((row) => clean(row.values.medicalRecordNumber)).filter(Boolean);
      if (numbers.length) {
        const existing = await this.prisma.patient.findMany({
          where: { medicalRecordNumber: { in: numbers } },
          select: { medicalRecordNumber: true },
        });
        const found = new Set(existing.map((row) => row.medicalRecordNumber));
        for (const row of rows) {
          const number = clean(row.values.medicalRecordNumber);
          if (number && found.has(number)) {
            row.errors.push(
              'Ce numéro de dossier existe déjà. Les modifications de patient doivent passer par la fiche individuelle.',
            );
          } else if (number) {
            row.errors.push(
              'Le numéro de dossier fourni est inconnu. Laissez cette colonne vide pour une création automatique.',
            );
          }
        }
      }
    }
    if (dataset === 'medications') duplicate('code', 'Le code');
    if (dataset === 'staff') {
      duplicate('username', "Le nom d'utilisateur");
      const usernames = rows.map((row) => clean(row.values.username)).filter(Boolean);
      const existing = usernames.length
        ? await this.prisma.user.findMany({
            where: { username: { in: usernames, mode: 'insensitive' } },
            select: { username: true, role: true },
          })
        : [];
      const byName = new Map(
        existing.map((row) => [row.username.toLocaleLowerCase('fr'), row.role]),
      );
      for (const row of rows) {
        const username = clean(row.values.username).toLocaleLowerCase('fr');
        const role = row.values.role as Role | null;
        const existingRole = byName.get(username);
        if (existingRole && role && existingRole !== role) {
          row.errors.push(
            `Le compte existe avec le rôle ${existingRole}. Un changement de rôle doit être fait manuellement.`,
          );
        }
        if (!existingRole && clean(row.values.password).length < 12) {
          row.errors.push('Un mot de passe initial d’au moins 12 caractères est obligatoire.');
        }
        if (existingRole && row.values.password) {
          row.warnings.push('Le mot de passe fourni sera ignoré pour ce compte existant.');
        }
      }
    }
    if (dataset === 'billable-services') duplicate('code', 'Le code');
    if (dataset === 'service-reports') {
      const groups = new Map<string, ImportRowResult[]>();
      for (const row of rows) {
        const key = [row.values.department, row.values.businessDate, row.values.shift]
          .map(clean)
          .join('|')
          .toUpperCase();
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const repeatedFields = [
        'newAdmissions',
        'hospitalized',
        'ambulatory',
        'MIH',
        'MIF',
        'PED',
        'GO',
        'MATERNITE',
        'CHIRURGIE',
      ];
      for (const [key, groupRows] of groups) {
        const first = groupRows[0];
        if (!first) continue;
        const itemNames = new Set<string>();
        for (const row of groupRows) {
          for (const field of repeatedFields) {
            if (clean(row.values[field]) !== clean(first.values[field])) {
              row.errors.push(
                `La valeur ${field} doit être identique sur toutes les lignes du même rapport.`,
              );
            }
          }
          const itemName = clean(row.values.itemName).toLocaleLowerCase('fr');
          if (itemNames.has(itemName)) {
            row.errors.push('Ce produit apparaît plusieurs fois dans le même rapport.');
          }
          itemNames.add(itemName);
        }
        const [department = '', businessDate = '', shift = ''] = key.split('|');
        const exists = await this.prisma.departmentDailyReport.count({
          where: { department, businessDate: new Date(businessDate), shift },
        });
        if (exists) {
          groupRows.forEach((row) =>
            row.errors.push('Un rapport existe déjà pour ce service, cette date et cette garde.'),
          );
        }
      }
    }
    if (dataset === 'requisitions') {
      const groups = new Map<string, ImportRowResult[]>();
      for (const row of rows) {
        const key = clean(row.values.group).toUpperCase();
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      for (const groupRows of groups.values()) {
        const first = groupRows[0];
        if (!first) continue;
        const itemNames = new Set<string>();
        for (const row of groupRows) {
          for (const field of ['department', 'priority', 'reason']) {
            if (clean(row.values[field]).toUpperCase() !== clean(first.values[field]).toUpperCase()) {
              row.errors.push(
                `La valeur ${field} doit être identique sur toutes les lignes de la même réquisition.`,
              );
            }
          }
          const itemName = clean(row.values.itemName).toLocaleLowerCase('fr');
          if (itemNames.has(itemName)) {
            row.errors.push('Ce produit apparaît plusieurs fois dans la même réquisition.');
          }
          itemNames.add(itemName);
        }
      }
    }
  }

  private async commitRows(
    dataset: DataSetKey,
    rows: Array<Record<string, unknown>>,
    user: AuthenticatedUser,
  ): Promise<{ created: number; updated: number }> {
    switch (dataset) {
      case 'patients':
        return this.commitPatients(rows);
      case 'medications':
        return this.commitMedications(rows, user.id);
      case 'staff':
        return this.commitStaff(rows);
      case 'service-reports':
        return this.commitServiceReports(rows, user.id);
      case 'requisitions':
        return this.commitRequisitions(rows, user.id);
      case 'billable-services':
        return this.commitBillableServices(rows);
      default:
        throw new BadRequestException('Ce jeu de données est disponible uniquement en export.');
    }
  }

  private async commitPatients(rows: Array<Record<string, unknown>>) {
    await this.prisma.$transaction(async (transaction) => {
      for (const row of rows) {
        await this.patients.create(
          {
            lastName: clean(row.lastName),
            postName: nullable(row.postName) ?? undefined,
            firstName: nullable(row.firstName) ?? undefined,
            sex: row.sex as Sex,
            dateOfBirth: nullable(row.dateOfBirth) ?? undefined,
            bloodType: nullable(row.bloodType) ?? undefined,
            address: nullable(row.address) ?? undefined,
            phone: nullable(row.phone) ?? undefined,
            emergencyContact: nullable(row.emergencyContact) ?? undefined,
          },
          transaction,
        );
      }
    });
    return { created: rows.length, updated: 0 };
  }

  private async commitMedications(rows: Array<Record<string, unknown>>, userId: string) {
    let created = 0;
    let updated = 0;
    await this.prisma.$transaction(async (transaction) => {
      for (const row of rows) {
        const code = clean(row.code).toUpperCase();
        const existing = await transaction.medication.findUnique({ where: { code } });
        const stockQuantity = Number(row.stockQuantity);
        const data = {
          name: clean(row.name),
          form: nullable(row.form),
          strength: nullable(row.strength),
          stockQuantity,
          minimumStock: Number(row.minimumStock),
          unitPrice: new Prisma.Decimal(Number(row.unitPrice)),
          isActive: Boolean(row.isActive),
        };
        if (existing) {
          await transaction.medication.update({ where: { id: existing.id }, data });
          const difference = stockQuantity - existing.stockQuantity;
          if (difference) {
            await transaction.stockMovement.create({
              data: {
                medicationId: existing.id,
                userId,
                type: 'ADJUSTMENT',
                quantity: Math.abs(difference),
                reason: `Ajustement par import (${existing.stockQuantity} vers ${stockQuantity})`,
                reference: `IMPORT-${randomUUID().slice(0, 8).toUpperCase()}`,
              },
            });
          }
          updated += 1;
        } else {
          const medication = await transaction.medication.create({ data: { code, ...data } });
          if (stockQuantity) {
            await transaction.stockMovement.create({
              data: {
                medicationId: medication.id,
                userId,
                type: 'ENTRY',
                quantity: stockQuantity,
                reason: 'Stock initial importé',
                reference: `IMPORT-${randomUUID().slice(0, 8).toUpperCase()}`,
              },
            });
          }
          created += 1;
        }
      }
    });
    return { created, updated };
  }

  private async commitStaff(rows: Array<Record<string, unknown>>) {
    const prepared = await Promise.all(
      rows.map(async (row) => ({
        row,
        passwordHash: row.password ? await argon2.hash(clean(row.password)) : null,
      })),
    );
    let created = 0;
    let updated = 0;
    await this.prisma.$transaction(async (transaction) => {
      for (const entry of prepared) {
        const row = entry.row;
        const username = clean(row.username);
        const role = row.role as Role;
        let user = await transaction.user.findFirst({
          where: { username: { equals: username, mode: 'insensitive' } },
        });
        if (!user) {
          user = await transaction.user.create({
            data: {
              username,
              passwordHash: entry.passwordHash!,
              role,
              isActive: Boolean(row.isActive),
            },
          });
          created += 1;
        } else {
          await transaction.user.update({
            where: { id: user.id },
            data: { isActive: Boolean(row.isActive) },
          });
          updated += 1;
        }
        const common = {
          lastName: clean(row.lastName),
          postName: nullable(row.postName),
          firstName: nullable(row.firstName),
          phone: nullable(row.phone),
          address: nullable(row.address),
        };
        if (clinicianRoles.has(role)) {
          await transaction.doctorProfile.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              ...common,
              specialty: clean(row.specialty),
              grade: nullable(row.grade),
              licenseNumber: nullable(row.licenseNumber)?.toUpperCase() ?? null,
            },
            update: {
              ...common,
              specialty: clean(row.specialty),
              grade: nullable(row.grade),
              licenseNumber: nullable(row.licenseNumber)?.toUpperCase() ?? null,
            },
          });
        } else if (role === Role.NURSE) {
          await transaction.nurseProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...common, specialty: nullable(row.specialty) },
            update: { ...common, specialty: nullable(row.specialty) },
          });
        } else if (role === Role.SECRETARY || role === Role.RECEPTIONIST) {
          await transaction.secretaryProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...common, educationLevel: nullable(row.educationLevel) },
            update: { ...common, educationLevel: nullable(row.educationLevel) },
          });
        } else if (role === Role.LAB_TECHNICIAN || role === Role.MEDICAL_BIOLOGIST) {
          await transaction.labTechnicianProfile.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...common, specialty: nullable(row.specialty) },
            update: { ...common, specialty: nullable(row.specialty) },
          });
        } else {
          await transaction.staffProfile.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              ...common,
              specialty: nullable(row.specialty),
              grade: nullable(row.grade),
            },
            update: {
              ...common,
              specialty: nullable(row.specialty),
              grade: nullable(row.grade),
            },
          });
        }
      }
    });
    return { created, updated };
  }

  private async commitServiceReports(rows: Array<Record<string, unknown>>, userId: string) {
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = [row.department, row.businessDate, row.shift].map(clean).join('|').toUpperCase();
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    await this.prisma.$transaction(async (transaction) => {
      for (const group of grouped.values()) {
        const first = group[0];
        if (!first) continue;
        const metrics = {
          MIH: Number(first.MIH ?? 0),
          MIF: Number(first.MIF ?? 0),
          PED: Number(first.PED ?? 0),
          GO: Number(first.GO ?? 0),
          MATERNITE: Number(first.MATERNITE ?? 0),
          CHIRURGIE: Number(first.CHIRURGIE ?? 0),
        };
        await transaction.departmentDailyReport.create({
          data: {
            reference: `RAP-${clean(first.businessDate).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
            department: clean(first.department).toUpperCase(),
            businessDate: new Date(clean(first.businessDate)),
            shift: clean(first.shift).toUpperCase(),
            newAdmissions: Number(first.newAdmissions),
            hospitalized: Number(first.hospitalized),
            ambulatory: Number(first.ambulatory),
            serviceTotal:
              Number(first.newAdmissions) +
              Number(first.hospitalized) +
              Number(first.ambulatory),
            metrics,
            createdById: userId,
            items: {
              create: group.map((row) => {
                const closingStock =
                  Number(row.openingStock) +
                  Number(row.receivedQuantity) +
                  Number(row.returnedQuantity) -
                  Number(row.usedQuantity) -
                  Number(row.lostQuantity);
                return {
                  itemName: clean(row.itemName),
                  unit: nullable(row.unit),
                  openingStock: Number(row.openingStock),
                  receivedQuantity: Number(row.receivedQuantity),
                  pendingOrder: Number(row.pendingOrder),
                  usedQuantity: Number(row.usedQuantity),
                  returnedQuantity: Number(row.returnedQuantity),
                  lostQuantity: Number(row.lostQuantity),
                  closingStock,
                  unitCost:
                    row.unitCost === null
                      ? null
                      : new Prisma.Decimal(Number(row.unitCost ?? 0)),
                  observations: nullable(row.observations),
                };
              }),
            },
          },
        });
      }
    });
    return { created: grouped.size, updated: 0 };
  }

  private async commitRequisitions(rows: Array<Record<string, unknown>>, userId: string) {
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const key = clean(row.group).toUpperCase();
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }
    await this.prisma.$transaction(async (transaction) => {
      for (const [groupKey, group] of grouped) {
        const first = group[0];
        if (!first) continue;
        await transaction.internalRequisition.create({
          data: {
            reference: `REQ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6).toUpperCase()}`,
            department: clean(first.department).toUpperCase(),
            priority: first.priority as RequisitionPriority,
            reason: clean(first.reason),
            notes: `Import groupé: ${groupKey}`,
            requestedById: userId,
            status: 'SUBMITTED',
            items: {
              create: group.map((row) => ({
                itemName: clean(row.itemName),
                unit: nullable(row.unit),
                quantityRequested: Number(row.quantityRequested),
                observations: nullable(row.observations),
              })),
            },
          },
        });
      }
    });
    return { created: grouped.size, updated: 0 };
  }

  private async commitBillableServices(rows: Array<Record<string, unknown>>) {
    let created = 0;
    let updated = 0;
    await this.prisma.$transaction(async (transaction) => {
      for (const row of rows) {
        const code = clean(row.code).toUpperCase();
        const exists = await transaction.billableService.count({ where: { code } });
        await transaction.billableService.upsert({
          where: { code },
          create: {
            code,
            name: clean(row.name),
            category: nullable(row.category),
            type: row.type as BillableServiceType,
            price: new Prisma.Decimal(Number(row.price)),
            requiresPrepayment: Boolean(row.requiresPrepayment),
            isActive: Boolean(row.isActive),
          },
          update: {
            name: clean(row.name),
            category: nullable(row.category),
            type: row.type as BillableServiceType,
            price: new Prisma.Decimal(Number(row.price)),
            requiresPrepayment: Boolean(row.requiresPrepayment),
            isActive: Boolean(row.isActive),
          },
        });
        if (exists) updated += 1;
        else created += 1;
      }
    });
    return { created, updated };
  }

  private audit(
    userId: string,
    action: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    const safeMetadata = JSON.parse(JSON.stringify(metadata)) as Prisma.InputJsonValue;
    return this.prisma.auditLog.create({
      data: { userId, action, entity: 'DataExchange', entityId, metadata: safeMetadata },
    });
  }
}
