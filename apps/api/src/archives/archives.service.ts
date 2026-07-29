import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AppointmentStatus,
  ArchiveAction,
  ClinicalOrderStatus,
  ConsultationStatus,
  CustomFieldEntity,
  ExamStatus,
  HospitalizationStatus,
  NursingCareStatus,
  Prisma,
} from '@prisma/client';
import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArchivePatientDto,
  ListArchivesDto,
  RestorePatientDto,
  UpdateArchivePolicyDto,
} from './dto/archive.dto';

interface ArchiveFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

export interface TimelineEntry {
  id: string;
  date: Date;
  department: string;
  title: string;
  status?: string;
  description?: string | null;
}

@Injectable()
export class ArchivesService {
  constructor(private readonly prisma: PrismaService) {}

  policy() {
    return this.prisma.archivePolicy.upsert({
      where: { id: 'patient' },
      update: {},
      create: { id: 'patient', retentionYears: 10, requireReason: true },
      include: { updatedBy: { select: { username: true } } },
    });
  }

  updatePolicy(dto: UpdateArchivePolicyDto, userId: string) {
    return this.prisma.archivePolicy.upsert({
      where: { id: 'patient' },
      update: {
        ...dto,
        autoArchiveAfterMonths: dto.autoArchiveAfterMonths ?? null,
        updatedById: userId,
      },
      create: { id: 'patient', ...dto, updatedById: userId },
      include: { updatedBy: { select: { username: true } } },
    });
  }

  async list(query: ListArchivesDto) {
    const search = query.search?.trim();
    const yearRange = query.year
      ? {
          gte: new Date(Date.UTC(query.year, 0, 1)),
          lt: new Date(Date.UTC(query.year + 1, 0, 1)),
        }
      : undefined;
    const where: Prisma.PatientWhereInput = {
      archivedAt: yearRange ?? { not: null },
      ...(query.department ? { archiveDepartment: query.department } : {}),
      ...(search
        ? {
            OR: [
              { medicalRecordNumber: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { postName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { archiveReason: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total, departments] = await this.prisma.$transaction([
      this.prisma.patient.findMany({
        where,
        omit: { identityKey: true },
        include: {
          archivedBy: { select: { id: true, username: true } },
          archiveEvents: {
            where: { action: ArchiveAction.ARCHIVED },
            orderBy: { occurredAt: 'desc' },
            take: 1,
            select: { reference: true },
          },
          _count: {
            select: {
              appointments: true,
              consultations: true,
              examRequests: true,
              hospitalizations: true,
              invoices: true,
              prescriptions: true,
            },
          },
        },
        orderBy: { archivedAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.patient.count({ where }),
      this.prisma.patient.groupBy({
        by: ['archiveDepartment'],
        where: { archivedAt: { not: null }, archiveDepartment: { not: null } },
        _count: true,
        orderBy: { archiveDepartment: 'asc' },
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        archiveReference: item.archiveEvents[0]?.reference ?? null,
        archiveEvents: undefined,
      })),
      filters: {
        departments: departments.map((row) => ({
          value: row.archiveDepartment,
          count: row._count,
        })),
      },
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async archive(id: string, dto: ArchivePatientDto, userId: string) {
    const policy = await this.policy();
    return this.prisma.$transaction(async (transaction) => {
      const patient = await transaction.patient.findUnique({
        where: { id },
        select: { id: true, medicalRecordNumber: true, archivedAt: true },
      });
      if (!patient) throw new NotFoundException('Patient introuvable.');
      if (patient.archivedAt) throw new BadRequestException('Ce patient est déjà archivé.');

      const blockers = await this.archiveBlockers(transaction, id);
      if (blockers.length > 0) {
        throw new BadRequestException({
          code: 'ARCHIVE_BLOCKED',
          message: `Archivage impossible : ${blockers.join(', ')}. Clôturez ces éléments avant de continuer.`,
          blockers,
        });
      }

      const archivedAt = new Date();
      const retentionYears = dto.retentionYears ?? policy.retentionYears;
      const retentionUntil = new Date(archivedAt);
      retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + retentionYears);
      const reference = this.reference('ARC');

      const updated = await transaction.patient.update({
        where: { id },
        data: {
          archivedAt,
          archiveDepartment: dto.department,
          archiveReason: dto.reason.trim(),
          retentionUntil,
          archivedById: userId,
          archiveEvents: {
            create: {
              reference,
              action: ArchiveAction.ARCHIVED,
              department: dto.department,
              reason: dto.reason.trim(),
              actorId: userId,
              metadata: { retentionYears },
            },
          },
        },
        omit: { identityKey: true },
        include: { archivedBy: { select: { username: true } } },
      });
      return { ...updated, archiveReference: reference };
    });
  }

  async restore(id: string, dto: RestorePatientDto, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const patient = await transaction.patient.findUnique({
        where: { id },
        select: {
          id: true,
          medicalRecordNumber: true,
          archivedAt: true,
          archiveDepartment: true,
        },
      });
      if (!patient) throw new NotFoundException('Patient introuvable.');
      if (!patient.archivedAt) throw new BadRequestException("Ce patient n'est pas archivé.");
      const reference = this.reference('RST');
      await transaction.patientArchiveEvent.create({
        data: {
          reference,
          patientId: id,
          action: ArchiveAction.RESTORED,
          department: patient.archiveDepartment,
          reason: dto.reason.trim(),
          actorId: userId,
          metadata: { previousArchivedAt: patient.archivedAt.toISOString() },
        },
      });
      const restored = await transaction.patient.update({
        where: { id },
        data: {
          archivedAt: null,
          archiveDepartment: null,
          archiveReason: null,
          retentionUntil: null,
          archivedById: null,
        },
        omit: { identityKey: true },
      });
      return { ...restored, restorationReference: reference };
    });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, archivedAt: { not: null } },
      omit: { identityKey: true },
      include: { archivedBy: { select: { id: true, username: true } } },
    });
    if (!patient) throw new NotFoundException('Archive patient introuvable.');

    const [
      appointments,
      consultations,
      vitalSigns,
      examinations,
      hospitalizations,
      invoices,
      clinicalOrders,
      insurancePolicies,
      transfusions,
      prescriptions,
      specialtyCases,
      radiologyStudies,
      careVouchers,
      nursingCare,
      customFields,
      events,
    ] = await Promise.all([
      this.prisma.appointment.findMany({
        where: { patientId: id },
        include: { doctor: true, careAuthorization: { include: { invoice: true } } },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.consultation.findMany({
        where: { patientId: id },
        include: { doctor: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.vitalSign.findMany({
        where: { patientId: id },
        include: { recordedBy: { select: { username: true } } },
        orderBy: { recordedAt: 'desc' },
      }),
      this.prisma.examRequest.findMany({
        where: { patientId: id },
        include: {
          requestedByDoctor: true,
          performedByLabTech: { include: { user: { select: { username: true } } } },
          validatedByLabTech: { include: { user: { select: { username: true } } } },
          careAuthorization: { include: { invoice: true } },
          document: {
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true },
          },
        },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.hospitalization.findMany({
        where: { patientId: id },
        include: { doctor: true, bed: { include: { room: true } }, careAuthorization: true },
        orderBy: { admittedAt: 'desc' },
      }),
      this.prisma.invoice.findMany({
        where: { patientId: id },
        include: {
          items: true,
          payments: true,
          careAuthorization: { include: { service: true } },
          insuranceCoverage: { include: { patientInsurance: { include: { provider: true } } } },
          voucherCoverage: { include: { careVoucher: true } },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      this.prisma.clinicalOrder.findMany({
        where: { patientId: id },
        include: { service: true, requestedBy: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patientInsurance.findMany({
        where: { patientId: id },
        include: { provider: true },
        orderBy: [{ isActive: 'desc' }, { validUntil: 'desc' }],
      }),
      this.prisma.bloodTransfusion.findMany({
        where: { patientId: id },
        include: { bloodUnit: true, prescribedBy: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.prescription.findMany({
        where: { patientId: id },
        include: {
          prescribedBy: { select: { username: true } },
          items: { include: { medication: true } },
        },
        orderBy: { prescribedAt: 'desc' },
      }),
      this.prisma.specialtyCase.findMany({
        where: { patientId: id },
        include: { responsible: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.radiologyStudy.findMany({
        where: { patientId: id },
        include: { performedBy: { select: { username: true } }, instances: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.careVoucher.findMany({
        where: { patientId: id },
        include: { coverages: { include: { invoice: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.nursingCare.findMany({
        where: { patientId: id },
        include: {
          orderedBy: { select: { username: true } },
          assignedNurse: { select: { username: true } },
          performedBy: { select: { username: true } },
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prisma.customFieldValue.findMany({
        where: { entityId: id, definition: { entity: CustomFieldEntity.PATIENT } },
        include: { definition: true },
        orderBy: { definition: { displayOrder: 'asc' } },
      }),
      this.prisma.patientArchiveEvent.findMany({
        where: { patientId: id },
        include: { actor: { select: { username: true } } },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    const records = {
      appointments,
      consultations,
      vitalSigns,
      examinations,
      hospitalizations,
      invoices,
      clinicalOrders,
      insurancePolicies,
      transfusions,
      prescriptions,
      specialtyCases,
      radiologyStudies,
      careVouchers,
      nursingCare,
    };
    const counts = Object.fromEntries(
      Object.entries(records).map(([key, rows]) => [key, rows.length]),
    );
    const timeline = this.timeline(records);
    return { patient, counts, customFields, events, timeline, records };
  }

  async export(id: string, format: string): Promise<ArchiveFile> {
    if (!['zip', 'pdf', 'xlsx'].includes(format)) {
      throw new BadRequestException('Le format doit être ZIP, PDF ou XLSX.');
    }
    const archive = await this.findOne(id);
    const number = archive.patient.medicalRecordNumber.replace(/[^a-z0-9-]/gi, '_');
    if (format === 'pdf') {
      return {
        filename: `archive-${number}.pdf`,
        contentType: 'application/pdf',
        buffer: await this.pdf(archive),
      };
    }
    if (format === 'xlsx') {
      return {
        filename: `archive-${number}.xlsx`,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: this.xlsx(archive),
      };
    }
    const documents = await this.prisma.labExamDocument.findMany({
      where: { examRequest: { patientId: id } },
      select: { id: true, fileName: true, data: true },
    });
    const files: Record<string, Uint8Array> = {
      'dossier-complet.json': strToU8(
        JSON.stringify(archive, (key, value) => this.jsonReplacer(key, value), 2),
      ),
      'LISEZ-MOI.txt': strToU8(
        `Archive du dossier ${archive.patient.medicalRecordNumber}\nCréée le ${new Date().toISOString()}\nLes documents numérisés du laboratoire se trouvent dans le dossier documents-laboratoire.`,
      ),
    };
    documents.forEach((document, index) => {
      files[`documents-laboratoire/${index + 1}-${this.safeFileName(document.fileName)}`] =
        Uint8Array.from(document.data);
    });
    return {
      filename: `archive-${number}.zip`,
      contentType: 'application/zip',
      buffer: Buffer.from(zipSync(files, { level: 6 })),
    };
  }

  private async archiveBlockers(transaction: Prisma.TransactionClient, patientId: string) {
    const [hospitalizations, consultations, appointments, orders, nursing, examinations] =
      await Promise.all([
        transaction.hospitalization.count({
          where: { patientId, status: HospitalizationStatus.ACTIVE },
        }),
        transaction.consultation.count({
          where: {
            patientId,
            status: { in: [ConsultationStatus.WAITING, ConsultationStatus.IN_PROGRESS] },
          },
        }),
        transaction.appointment.count({
          where: { patientId, status: AppointmentStatus.CHECKED_IN },
        }),
        transaction.clinicalOrder.count({
          where: {
            patientId,
            status: { in: [ClinicalOrderStatus.SCHEDULED, ClinicalOrderStatus.IN_PROGRESS] },
          },
        }),
        transaction.nursingCare.count({
          where: {
            patientId,
            status: {
              in: [
                NursingCareStatus.ORDERED,
                NursingCareStatus.SCHEDULED,
                NursingCareStatus.IN_PROGRESS,
              ],
            },
          },
        }),
        transaction.examRequest.count({
          where: {
            patientId,
            status: { in: [ExamStatus.REQUESTED, ExamStatus.IN_PROGRESS, ExamStatus.COMPLETED] },
          },
        }),
      ]);
    return [
      hospitalizations ? `${hospitalizations} hospitalisation(s) active(s)` : null,
      consultations ? `${consultations} consultation(s) ouverte(s)` : null,
      appointments ? `${appointments} patient(s) encore en salle d’attente` : null,
      orders ? `${orders} acte(s) clinique(s) non clôturé(s)` : null,
      nursing ? `${nursing} soin(s) infirmier(s) non clôturé(s)` : null,
      examinations ? `${examinations} examen(s) non validé(s)` : null,
    ].filter((value): value is string => Boolean(value));
  }

  private timeline(records: {
    appointments: Array<{ id: string; scheduledAt: Date; service: string; status: string }>;
    consultations: Array<{
      id: string;
      createdAt: Date;
      reason: string;
      status: string;
      report: string | null;
    }>;
    examinations: Array<{
      id: string;
      requestedAt: Date;
      type: string;
      status: string;
      result: string | null;
    }>;
    hospitalizations: Array<{ id: string; admittedAt: Date; reason: string; status: string }>;
    invoices: Array<{
      id: string;
      issuedAt: Date;
      number: string;
      status: string;
      total: Prisma.Decimal;
    }>;
    prescriptions: Array<{ id: string; prescribedAt: Date; number: string; status: string }>;
    nursingCare: Array<{
      id: string;
      scheduledAt: Date;
      label: string;
      status: string;
      observations: string | null;
    }>;
    clinicalOrders: Array<{
      id: string;
      createdAt: Date;
      type: string;
      status: string;
      result: string | null;
    }>;
    specialtyCases: Array<{
      id: string;
      createdAt: Date;
      title: string;
      status: string;
      report: string | null;
    }>;
    radiologyStudies: Array<{
      id: string;
      createdAt: Date;
      bodyPart: string;
      status: string;
      report: string | null;
    }>;
  }): TimelineEntry[] {
    const entries: TimelineEntry[] = [];
    const add = (rows: TimelineEntry[]) => entries.push(...rows);
    add(
      records.appointments.map((row) => ({
        id: row.id,
        date: row.scheduledAt,
        department: 'RECEPTION',
        title: row.service,
        status: row.status,
      })),
    );
    add(
      records.consultations.map((row) => ({
        id: row.id,
        date: row.createdAt,
        department: 'CLINICAL',
        title: row.reason,
        status: row.status,
        description: row.report,
      })),
    );
    add(
      records.examinations.map((row) => ({
        id: row.id,
        date: row.requestedAt,
        department: 'LABORATORY',
        title: row.type,
        status: row.status,
        description: row.result,
      })),
    );
    add(
      records.hospitalizations.map((row) => ({
        id: row.id,
        date: row.admittedAt,
        department: 'HOSPITALIZATION',
        title: row.reason,
        status: row.status,
      })),
    );
    add(
      records.invoices.map((row) => ({
        id: row.id,
        date: row.issuedAt,
        department: 'FINANCE',
        title: row.number,
        status: row.status,
        description: `${Number(row.total)} CDF`,
      })),
    );
    add(
      records.prescriptions.map((row) => ({
        id: row.id,
        date: row.prescribedAt,
        department: 'PHARMACY',
        title: row.number,
        status: row.status,
      })),
    );
    add(
      records.nursingCare.map((row) => ({
        id: row.id,
        date: row.scheduledAt,
        department: 'NURSING',
        title: row.label,
        status: row.status,
        description: row.observations,
      })),
    );
    add(
      records.clinicalOrders.map((row) => ({
        id: row.id,
        date: row.createdAt,
        department: 'CLINICAL',
        title: row.type,
        status: row.status,
        description: row.result,
      })),
    );
    add(
      records.specialtyCases.map((row) => ({
        id: row.id,
        date: row.createdAt,
        department: 'SPECIALTY',
        title: row.title,
        status: row.status,
        description: row.report,
      })),
    );
    add(
      records.radiologyStudies.map((row) => ({
        id: row.id,
        date: row.createdAt,
        department: 'RADIOLOGY',
        title: `Imagerie ${row.bodyPart}`,
        status: row.status,
        description: row.report,
      })),
    );
    return entries.sort((left, right) => right.date.getTime() - left.date.getTime());
  }

  private pdf(archive: Awaited<ReturnType<ArchivesService['findOne']>>): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', margin: 42, bufferPages: true });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      const patient = archive.patient;
      const patientName = [patient.lastName, patient.postName, patient.firstName]
        .filter(Boolean)
        .join(' ');
      document.fontSize(18).fillColor('#0f5f50').text('DOSSIER PATIENT ARCHIVÉ');
      document.moveDown(0.4).fontSize(12).fillColor('#111827');
      document.text(`${patient.medicalRecordNumber} — ${patientName}`);
      document.text(`Archivé le : ${patient.archivedAt?.toLocaleString('fr-FR') ?? '—'}`);
      document.text(`Département : ${patient.archiveDepartment ?? 'Général'}`);
      document.text(`Motif : ${patient.archiveReason ?? '—'}`);
      document.text(
        `Conservation jusqu’au : ${patient.retentionUntil?.toLocaleDateString('fr-FR') ?? '—'}`,
      );
      document.moveDown();
      document.fontSize(14).fillColor('#0f5f50').text('Synthèse');
      document.fontSize(10).fillColor('#111827');
      Object.entries(archive.counts).forEach(([label, value]) =>
        document.text(`${label} : ${value}`),
      );
      document.moveDown();
      document.fontSize(14).fillColor('#0f5f50').text('Chronologie');
      document.fontSize(9).fillColor('#111827');
      archive.timeline.forEach((entry) => {
        if (document.y > 750) document.addPage();
        document
          .font('Helvetica-Bold')
          .text(`${entry.date.toLocaleString('fr-FR')} · ${entry.department} · ${entry.title}`);
        document.font('Helvetica').text(`Statut : ${entry.status ?? '—'}`);
        if (entry.description) document.text(entry.description.slice(0, 700));
        document.moveDown(0.35);
      });
      document.end();
    });
  }

  private xlsx(archive: Awaited<ReturnType<ArchivesService['findOne']>>) {
    const patient = archive.patient;
    const rows: Array<Array<string | number>> = [
      ['Date', 'Département', 'Élément', 'Statut', 'Description'],
      ...archive.timeline.map((entry) => [
        entry.date.toISOString(),
        entry.department,
        entry.title,
        entry.status ?? '',
        entry.description ?? '',
      ]),
    ];
    const sheet = this.sheetXml(rows);
    const summary = this.sheetXml([
      ['Champ', 'Valeur'],
      ['Numéro', patient.medicalRecordNumber],
      ['Nom', [patient.lastName, patient.postName, patient.firstName].filter(Boolean).join(' ')],
      ['Département', patient.archiveDepartment ?? ''],
      ['Motif', patient.archiveReason ?? ''],
      ['Archivé le', patient.archivedAt?.toISOString() ?? ''],
      ['Conservation jusqu’au', patient.retentionUntil?.toISOString() ?? ''],
      ...Object.entries(archive.counts),
    ]);
    return Buffer.from(
      zipSync(
        {
          '[Content_Types].xml': strToU8(
            '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
          ),
          '_rels/.rels': strToU8(
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
          ),
          'xl/workbook.xml': strToU8(
            '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthèse" sheetId="1" r:id="rId1"/><sheet name="Chronologie" sheetId="2" r:id="rId2"/></sheets></workbook>',
          ),
          'xl/_rels/workbook.xml.rels': strToU8(
            '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
          ),
          'xl/worksheets/sheet1.xml': strToU8(summary),
          'xl/worksheets/sheet2.xml': strToU8(sheet),
        },
        { level: 6 },
      ),
    );
  }

  private sheetXml(rows: Array<Array<string | number>>) {
    const body = rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((value, columnIndex) => {
              const reference = `${this.columnName(columnIndex + 1)}${rowIndex + 1}`;
              return typeof value === 'number'
                ? `<c r="${reference}"><v>${value}</v></c>`
                : `<c r="${reference}" t="inlineStr"><is><t>${this.xml(value)}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('');
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  private columnName(column: number) {
    let name = '';
    while (column > 0) {
      column -= 1;
      name = String.fromCharCode(65 + (column % 26)) + name;
      column = Math.floor(column / 26);
    }
    return name;
  }

  private xml(value: string | number) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private safeFileName(value: string) {
    return value.replace(/[^a-z0-9._-]/gi, '_').slice(0, 180) || 'document';
  }

  private reference(prefix: 'ARC' | 'RST') {
    return `${prefix}-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private jsonReplacer(_key: string, value: unknown) {
    if (value instanceof Uint8Array) return `[Données binaires : ${value.byteLength} octets]`;
    return value;
  }
}
