import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomFieldEntity, JournalEntryStatus, Prisma } from '@prisma/client';
import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';

export type ExportReport = 'patients' | 'finance' | 'billing' | 'pharmacy' | 'hr' | 'regulatory';
export type ExportFormat = 'xlsx' | 'csv' | 'pdf';

type CellValue = string | number | boolean | Date | null | undefined;
type ReportTable = { name: string; columns: string[]; rows: CellValue[][] };

@Injectable()
export class EnterpriseExportService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(report: ExportReport, format: ExportFormat, from?: string, to?: string) {
    const allowedReports: ExportReport[] = [
      'patients',
      'finance',
      'billing',
      'pharmacy',
      'hr',
      'regulatory',
    ];
    if (!allowedReports.includes(report)) throw new BadRequestException('Rapport inconnu.');
    if (format !== 'xlsx' && format !== 'csv' && format !== 'pdf') {
      throw new BadRequestException('Le format doit être xlsx, csv ou pdf.');
    }
    const tables = await this.tables(report, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      const table = tables[0]!;
      const csv = [table.columns, ...table.rows]
        .map((row) => row.map((value) => this.csvCell(value)).join(','))
        .join('\r\n');
      return {
        filename: `${report}-${stamp}.csv`,
        contentType: 'text/csv; charset=utf-8',
        buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'),
      };
    }
    if (format === 'pdf') {
      const profile = await this.prisma.hospitalProfile.upsert({
        where: { id: 'main' },
        update: {},
        create: { id: 'main', name: "Centre Hospitalier d'Isiro", currency: 'CDF' },
      });
      return {
        filename: `${report}-${stamp}.pdf`,
        contentType: 'application/pdf',
        buffer: await this.pdf(tables, report, profile),
      };
    }
    return {
      filename: `${report}-${stamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: this.xlsx(tables),
    };
  }

  private async tables(report: ExportReport, from?: string, to?: string): Promise<ReportTable[]> {
    const range = this.dateRange(from, to);
    if (report === 'patients') {
      const [rows, fields, values] = await Promise.all([
        this.prisma.patient.findMany({ orderBy: { createdAt: 'desc' } }),
        this.prisma.customFieldDefinition.findMany({
          where: { entity: CustomFieldEntity.PATIENT, isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { label: 'asc' }],
        }),
        this.prisma.customFieldValue.findMany({
          where: { definition: { entity: CustomFieldEntity.PATIENT, isActive: true } },
          include: { definition: true },
        }),
      ]);
      const customByPatient = new Map<string, Map<string, Prisma.JsonValue>>();
      for (const value of values) {
        const patientValues =
          customByPatient.get(value.entityId) ?? new Map<string, Prisma.JsonValue>();
        patientValues.set(value.definition.key, value.value);
        customByPatient.set(value.entityId, patientValues);
      }
      return [
        {
          name: 'Patients',
          columns: [
            'Numéro',
            'Nom',
            'Postnom',
            'Prénom',
            'Sexe',
            'Naissance',
            'Téléphone',
            'Créé le',
            ...fields.map((field) => field.label),
          ],
          rows: rows.map((patient) => [
            patient.medicalRecordNumber,
            patient.lastName,
            patient.postName,
            patient.firstName,
            patient.sex,
            patient.dateOfBirth,
            patient.phone,
            patient.createdAt,
            ...fields.map((field) =>
              this.jsonCell(customByPatient.get(patient.id)?.get(field.key)),
            ),
          ]),
        },
      ];
    }
    if (report === 'finance') return [await this.financeTable(range)];
    if (report === 'billing') return this.billingTables(range);
    if (report === 'pharmacy') {
      const rows = await this.prisma.medicationBatch.findMany({
        include: { medication: true },
        orderBy: { expiresAt: 'asc' },
      });
      return [
        {
          name: 'Pharmacie',
          columns: [
            'Médicament',
            'Lot',
            'Stock lot',
            'Stock total',
            'Expiration',
            'Quarantaine',
            'Coût unitaire',
          ],
          rows: rows.map((batch) => [
            batch.medication.name,
            batch.lotNumber,
            batch.quantity,
            batch.medication.stockQuantity,
            batch.expiresAt,
            batch.isQuarantined,
            Number(batch.unitCost ?? 0),
          ]),
        },
      ];
    }
    if (report === 'hr') {
      const [attendance, payroll] = await Promise.all([
        this.prisma.attendanceRecord.findMany({
          where: range ? { date: range } : {},
          include: { employee: { include: { staffProfile: true } } },
          orderBy: { date: 'desc' },
        }),
        this.prisma.payrollEntry.findMany({
          where: range ? { period: { startsOn: range } } : {},
          include: { employee: { include: { staffProfile: true } }, period: true },
          orderBy: { period: { startsOn: 'desc' } },
        }),
      ]);
      return [
        {
          name: 'Présences',
          columns: ['Date', 'Matricule', 'Employé', 'Statut', 'Entrée', 'Sortie', 'Retard (min)'],
          rows: attendance.map((item) => [
            item.date,
            item.employee.staffProfile?.id,
            item.employee.username,
            item.status,
            item.clockIn,
            item.clockOut,
            item.minutesLate,
          ]),
        },
        {
          name: 'Paie',
          columns: [
            'Période',
            'Employé',
            'Base',
            'Primes',
            'Heures sup.',
            'Retenues',
            'Taxes',
            'Net',
            'Statut',
          ],
          rows: payroll.map((item) => [
            item.period.label,
            item.employee.username,
            Number(item.baseSalary),
            Number(item.allowances),
            Number(item.overtime),
            Number(item.deductions),
            Number(item.taxes),
            Number(item.netSalary),
            item.status,
          ]),
        },
      ];
    }
    const [finance, patients, pharmacy, attendance, radiology, customFields] = await Promise.all([
      this.financeTable(range),
      this.prisma.patient.count({ where: range ? { createdAt: range } : {} }),
      this.prisma.medicationBatch.count({
        where: { expiresAt: { lte: new Date() }, quantity: { gt: 0 } },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ['status'],
        where: range ? { date: range } : {},
        _count: true,
      }),
      this.prisma.radiologyStudy.count({ where: range ? { createdAt: range } : {} }),
      this.prisma.customFieldDefinition.findMany({
        orderBy: [{ entity: 'asc' }, { displayOrder: 'asc' }],
      }),
    ]);
    return [
      {
        name: 'Indicateurs',
        columns: ['Indicateur réglementaire', 'Valeur'],
        rows: [
          ['Nouveaux patients', patients],
          ['Lots expirés avec stock', pharmacy],
          ['Études radiologiques', radiology],
          ...attendance.map((item) => [`Présence ${item.status}`, item._count]),
        ],
      },
      finance,
      {
        name: 'Rubriques configurées',
        columns: ['Module', 'Clé', 'Libellé', 'Type', 'Obligatoire', 'Active'],
        rows: customFields.map((field) => [
          field.entity,
          field.key,
          field.label,
          field.type,
          field.required,
          field.isActive,
        ]),
      },
    ];
  }

  private async financeTable(range?: { gte?: Date; lte?: Date }): Promise<ReportTable> {
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: JournalEntryStatus.POSTED, ...(range ? { date: range } : {}) },
      include: { lines: { include: { account: true } } },
      orderBy: { date: 'desc' },
    });
    return {
      name: 'Finance',
      columns: ['Écriture', 'Date', 'Compte', 'Libellé', 'Débit', 'Crédit', 'Référence'],
      rows: entries.flatMap((entry) =>
        entry.lines.map((line) => [
          entry.number,
          entry.date,
          `${line.account.code} - ${line.account.name}`,
          line.description ?? entry.description,
          Number(line.debit),
          Number(line.credit),
          entry.reference,
        ]),
      ),
    };
  }

  private async billingTables(range?: { gte?: Date; lte?: Date }): Promise<ReportTable[]> {
    const [invoices, payments, closures] = await Promise.all([
      this.prisma.invoice.findMany({
        where: range ? { issuedAt: range } : {},
        include: { patient: true, items: true, payments: true },
        orderBy: { issuedAt: 'asc' },
        take: 5000,
      }),
      this.prisma.payment.findMany({
        where: range ? { paidAt: range } : {},
        include: {
          invoice: { include: { patient: true } },
          receivedBy: { select: { username: true } },
        },
        orderBy: { paidAt: 'asc' },
        take: 5000,
      }),
      this.prisma.cashClosure.findMany({
        where: range ? { businessDate: range } : {},
        include: { closedBy: { select: { username: true } } },
        orderBy: { businessDate: 'asc' },
        take: 366,
      }),
    ]);
    const summaryRows: CellValue[][] = closures.length
      ? closures.flatMap((closure) => [
          ['Date clôturée', closure.businessDate],
          ['Clôturée par', closure.closedBy.username],
          ['Factures', closure.invoiceCount],
          ['Encaissements', closure.paymentCount],
          ['Total facturé', Number(closure.totalBilled)],
          ['Total encaissé', Number(closure.totalCollected)],
          ['Espèces', Number(closure.cashTotal)],
          ['Mobile money', Number(closure.mobileTotal)],
          ['Banque', Number(closure.bankTotal)],
          ['Carte', Number(closure.cardTotal)],
          ['Part patient', Number(closure.patientTotal)],
          ['Part assureur', Number(closure.insurerTotal)],
          ['Part organisme', Number(closure.sponsorTotal)],
        ])
      : [['État', 'Journée non clôturée']];
    return [
      { name: 'Synthèse', columns: ['Indicateur', 'Valeur'], rows: summaryRows },
      {
        name: 'Factures',
        columns: [
          'Facture',
          'Date',
          'Dossier',
          'Patient',
          'Prestation',
          'Quantité',
          'Prix unitaire',
          'Total ligne',
          'Total facture',
          'Payé',
          'Statut',
        ],
        rows: invoices.flatMap((invoice) => {
          const paid = invoice.payments.reduce(
            (total, payment) => total + Number(payment.amount),
            0,
          );
          return invoice.items.map((item) => [
            invoice.number,
            invoice.issuedAt,
            invoice.patient.medicalRecordNumber,
            [invoice.patient.lastName, invoice.patient.postName, invoice.patient.firstName]
              .filter(Boolean)
              .join(' '),
            item.description,
            item.quantity,
            Number(item.unitPrice),
            Number(item.total),
            Number(invoice.total),
            paid,
            invoice.status,
          ]);
        }),
      },
      {
        name: 'Encaissements',
        columns: [
          'Date',
          'Facture',
          'Dossier',
          'Patient',
          'Montant',
          'Mode',
          'Payeur',
          'Référence',
          'Reçu par',
        ],
        rows: payments.map((payment) => [
          payment.paidAt,
          payment.invoice.number,
          payment.invoice.patient.medicalRecordNumber,
          [
            payment.invoice.patient.lastName,
            payment.invoice.patient.postName,
            payment.invoice.patient.firstName,
          ]
            .filter(Boolean)
            .join(' '),
          Number(payment.amount),
          payment.method,
          payment.payerType,
          payment.reference,
          payment.receivedBy.username,
        ]),
      },
    ];
  }

  private dateRange(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (from) range.gte = new Date(`${from}T00:00:00+02:00`);
    if (to) {
      const startOfLastDay = new Date(`${to}T00:00:00+02:00`);
      range.lte = new Date(startOfLastDay.getTime() + 86_400_000 - 1);
    }
    if (
      (range.gte && Number.isNaN(range.gte.getTime())) ||
      (range.lte && Number.isNaN(range.lte.getTime()))
    ) {
      throw new BadRequestException('Période de rapport invalide.');
    }
    return range;
  }

  private csvCell(value: CellValue) {
    const text = value instanceof Date ? value.toISOString() : String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
  }

  private jsonCell(value: Prisma.JsonValue | undefined): CellValue {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return JSON.stringify(value);
  }

  private xlsx(tables: ReportTable[]) {
    const sheetFiles = Object.fromEntries(
      tables.map((table, index) => [
        `xl/worksheets/sheet${index + 1}.xml`,
        strToU8(this.sheetXml(table)),
      ]),
    );
    const sheets = tables
      .map(
        (table, index) =>
          `<sheet name="${this.xml(table.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
      )
      .join('');
    const relationships = tables
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
      )
      .join('');
    const overrides = tables
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('');
    const archive = zipSync(
      {
        '[Content_Types].xml': strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`,
        ),
        '_rels/.rels': strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        ),
        'xl/workbook.xml': strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
        ),
        'xl/styles.xml': strToU8(
          '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
        ),
        ...sheetFiles,
      },
      { level: 6 },
    );
    return Buffer.from(archive);
  }

  private pdf(
    tables: ReportTable[],
    report: ExportReport,
    profile: {
      name: string;
      legalName: string | null;
      address: string | null;
      phone: string | null;
      email: string | null;
      documentHeader: string | null;
      invoiceFooter: string | null;
      documentAccentColor: string;
      logoDataUrl: string | null;
    },
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
      const accent = /^#[0-9a-f]{6}$/i.test(profile.documentAccentColor)
        ? profile.documentAccentColor
        : '#167757';
      const pageWidth =
        document.page.width - document.page.margins.left - document.page.margins.right;

      const drawIdentity = (title: string) => {
        if (profile.logoDataUrl) {
          try {
            const base64 = profile.logoDataUrl.split(',')[1];
            if (base64) document.image(Buffer.from(base64, 'base64'), 32, 28, { fit: [45, 45] });
          } catch {
            // Le rapport reste exportable si une ancienne image n'est plus lisible.
          }
        }
        document
          .fillColor(accent)
          .font('Helvetica-Bold')
          .fontSize(15)
          .text(profile.name, 85, 30, { width: pageWidth - 53 });
        document
          .fillColor('#374151')
          .font('Helvetica')
          .fontSize(8)
          .text(
            [profile.legalName, profile.address, profile.phone, profile.email]
              .filter(Boolean)
              .join(' · '),
            85,
            49,
            { width: pageWidth - 53 },
          );
        document
          .fillColor(accent)
          .rect(32, 75, pageWidth, 2)
          .fill()
          .font('Helvetica-Bold')
          .fontSize(13)
          .text(title, 32, 86, { width: pageWidth, align: 'center' });
        if (profile.documentHeader) {
          document
            .fillColor('#4b5563')
            .font('Helvetica')
            .fontSize(8)
            .text(profile.documentHeader, 32, 104, { width: pageWidth, align: 'center' });
        }
        document.y = profile.documentHeader ? 125 : 112;
      };

      const addPage = (title: string) => {
        document.addPage({ size: 'A4', layout: 'landscape', margin: 32 });
        drawIdentity(title);
      };

      tables.forEach((table, tableIndex) => {
        if (tableIndex > 0) addPage(`${report.toUpperCase()} — ${table.name}`);
        else drawIdentity(`${report.toUpperCase()} — ${table.name}`);
        const width = pageWidth / Math.max(table.columns.length, 1);
        const fontSize = Math.max(5.5, Math.min(8, 72 / Math.max(table.columns.length, 1)));
        const drawHeader = () => {
          const y = document.y;
          document.fillColor(accent).rect(32, y, pageWidth, 22).fill();
          document.fillColor('#ffffff').font('Helvetica-Bold').fontSize(fontSize);
          table.columns.forEach((column, index) => {
            document.text(column, 35 + index * width, y + 6, {
              width: width - 6,
              height: 12,
              ellipsis: true,
            });
          });
          document.y = y + 24;
        };
        drawHeader();
        table.rows.forEach((row, rowIndex) => {
          if (document.y > document.page.height - 60) {
            addPage(`${report.toUpperCase()} — ${table.name} (suite)`);
            drawHeader();
          }
          const y = document.y;
          if (rowIndex % 2 === 1) document.fillColor('#f3f4f6').rect(32, y, pageWidth, 19).fill();
          document.fillColor('#111827').font('Helvetica').fontSize(fontSize);
          row.forEach((value, index) => {
            const text =
              value instanceof Date ? value.toLocaleString('fr-FR') : String(value ?? '');
            document.text(text, 35 + index * width, y + 5, {
              width: width - 6,
              height: 11,
              ellipsis: true,
            });
          });
          document.y = y + 19;
        });
      });
      document
        .fillColor('#6b7280')
        .fontSize(7)
        .text(
          profile.invoiceFooter || 'Rapport généré par le système hospitalier',
          32,
          document.page.height - 35,
          {
            width: pageWidth,
            align: 'center',
          },
        );
      document.end();
    });
  }

  private sheetXml(table: ReportTable) {
    const rows = [table.columns, ...table.rows]
      .map((row, rowIndex) => {
        const cells = row
          .map((value, columnIndex) =>
            this.cellXml(
              value,
              `${this.columnName(columnIndex + 1)}${rowIndex + 1}`,
              rowIndex === 0,
            ),
          )
          .join('');
        return `<row r="${rowIndex + 1}">${cells}</row>`;
      })
      .join('');
    const columns = table.columns
      .map((column, index) => {
        const width = Math.min(
          45,
          Math.max(
            column.length + 2,
            ...table.rows.map((row) => String(row[index] ?? '').length + 2),
          ),
        );
        return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
      })
      .join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${rows}</sheetData><autoFilter ref="A1:${this.columnName(table.columns.length)}1"/></worksheet>`;
  }

  private cellXml(value: CellValue, reference: string, header: boolean) {
    const style = header ? ' s="1"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `<c r="${reference}"${style}><v>${value}</v></c>`;
    }
    if (typeof value === 'boolean') {
      return `<c r="${reference}" t="b"${style}><v>${value ? 1 : 0}</v></c>`;
    }
    const text = value instanceof Date ? value.toISOString() : String(value ?? '');
    return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${this.xml(text)}</t></is></c>`;
  }

  private xml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private columnName(number: number) {
    let result = '';
    let value = number;
    while (value > 0) {
      value -= 1;
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26);
    }
    return result;
  }
}
