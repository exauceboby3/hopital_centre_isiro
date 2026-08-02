import { BadRequestException, Injectable } from '@nestjs/common';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';
import {
  ExportFormat,
  ParsedTabularFile,
  TabularDocument,
} from './data-exchange.types';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CSV_BOM = '\uFEFF';

function text(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlDecode(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

function stripXml(value: string): string {
  return xmlDecode(value.replace(/<[^>]+>/g, ''));
}

function columnName(index: number): string {
  let result = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function quoteCsv(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

@Injectable()
export class TabularCodecService {
  encode(document: TabularDocument, format: ExportFormat): Promise<Buffer> | Buffer {
    if (format === 'csv') return this.encodeCsv(document);
    if (format === 'xlsx') return this.encodeXlsx(document);
    return this.encodePdf(document);
  }

  parse(fileName: string, mimeType: string, buffer: Buffer): ParsedTabularFile {
    if (!buffer.length) throw new BadRequestException('Le fichier est vide.');
    if (buffer.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Le fichier dépasse la limite de 10 Mo.');
    }
    const lower = fileName.toLowerCase();
    if (lower.endsWith('.xlsx') || mimeType.includes('spreadsheet') || buffer.subarray(0, 2).toString() === 'PK') {
      return this.parseXlsx(buffer);
    }
    if (lower.endsWith('.csv') || mimeType.includes('csv') || mimeType.startsWith('text/')) {
      return this.parseCsv(buffer.toString('utf8'));
    }
    throw new BadRequestException('Format non accepté. Utilisez CSV ou Excel (.xlsx).');
  }

  encodeCsv(document: TabularDocument): Buffer {
    const lines = [document.columns.map((column) => quoteCsv(column.label)).join(';')];
    for (const row of document.rows) {
      lines.push(document.columns.map((column) => quoteCsv(text(row[column.key]))).join(';'));
    }
    return Buffer.from(`${CSV_BOM}${lines.join('\r\n')}\r\n`, 'utf8');
  }

  parseCsv(input: string): ParsedTabularFile {
    const source = input.replace(/^\uFEFF/, '');
    const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
    const candidates = [';', ',', '\t'];
    const delimiter = candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (character === '"') quoted = false;
        else field += character;
      } else if (character === '"') quoted = true;
      else if (character === delimiter) {
        row.push(field.trim());
        field = '';
      } else if (character === '\n') {
        row.push(field.replace(/\r$/, '').trim());
        if (row.some((cell) => cell !== '')) rows.push(row);
        row = [];
        field = '';
      } else field += character;
    }
    row.push(field.replace(/\r$/, '').trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
    if (!rows.length) throw new BadRequestException('Aucune ligne exploitable dans le fichier CSV.');
    const headers = rows[0].map((header) => header.trim());
    if (!headers.some(Boolean)) throw new BadRequestException('La ligne des en-têtes est vide.');
    const objects = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
    if (objects.length > 5000) throw new BadRequestException('Un import est limité à 5 000 lignes.');
    return { headers, rows: objects, format: 'csv' };
  }

  encodeXlsx(document: TabularDocument): Buffer {
    const allRows = [
      document.columns.map((column) => column.label),
      ...document.rows.map((row) => document.columns.map((column) => row[column.key])),
    ];
    const sheetRows = allRows
      .map((cells, rowIndex) => {
        const cellXml = cells
          .map((value, columnIndex) => {
            const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
            if (typeof value === 'number' && Number.isFinite(value)) {
              return `<c r="${reference}" s="${rowIndex === 0 ? 1 : 0}"><v>${value}</v></c>`;
            }
            return `<c r="${reference}" t="inlineStr" s="${rowIndex === 0 ? 1 : 0}"><is><t xml:space="preserve">${xmlEscape(text(value))}</t></is></c>`;
          })
          .join('');
        return `<row r="${rowIndex + 1}">${cellXml}</row>`;
      })
      .join('');
    const widths = document.columns
      .map((column, index) => {
        const max = Math.max(column.label.length, ...document.rows.slice(0, 200).map((row) => text(row[column.key]).length));
        return `<col min="${index + 1}" max="${index + 1}" width="${Math.min(45, Math.max(12, max + 2))}" customWidth="1"/>`;
      })
      .join('');
    const sheet = `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:${columnName(document.columns.length - 1)}${allRows.length}"/></worksheet>`;
    const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Données" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const styles = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF167757"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
    const files: Record<string, Uint8Array> = {
      '[Content_Types].xml': strToU8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
      '_rels/.rels': strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
      'xl/styles.xml': strToU8(styles),
    };
    return Buffer.from(zipSync(files, { level: 6 }));
  }

  parseXlsx(buffer: Buffer): ParsedTabularFile {
    let archive: Record<string, Uint8Array>;
    try {
      archive = unzipSync(new Uint8Array(buffer));
    } catch {
      throw new BadRequestException('Le fichier Excel est corrompu ou illisible.');
    }
    const sheetBytes = archive['xl/worksheets/sheet1.xml'];
    if (!sheetBytes) throw new BadRequestException('La première feuille Excel est introuvable.');
    const sharedBytes = archive['xl/sharedStrings.xml'];
    const shared = sharedBytes
      ? [...strFromU8(sharedBytes).matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)].map((match) => stripXml(match[1]))
      : [];
    const sheet = strFromU8(sheetBytes);
    const table: string[][] = [];
    for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cellMatch[1];
        const body = cellMatch[2];
        const ref = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1] ?? 'A';
        let index = 0;
        for (const character of ref) index = index * 26 + character.charCodeAt(0) - 64;
        index -= 1;
        const type = /\bt="([^"]+)"/.exec(attributes)?.[1];
        const raw = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? '';
        const value = type === 's' ? shared[Number(raw)] ?? '' : xmlDecode(raw);
        cells[index] = value;
      }
      if (cells.some((cell) => cell !== undefined && cell !== '')) table.push(cells.map((cell) => cell ?? ''));
    }
    if (!table.length) throw new BadRequestException('La feuille Excel ne contient aucune donnée.');
    const headers = table[0].map((value) => value.trim());
    const rows = table.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ''])));
    if (rows.length > 5000) throw new BadRequestException('Un import est limité à 5 000 lignes.');
    return { headers, rows, format: 'xlsx' };
  }

  encodePdf(document: TabularDocument): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const paperSize = document.columns.length > 12 ? 'A3' : 'A4';
      const pdf = new PDFDocument({
        size: paperSize,
        layout: 'landscape',
        margin: 24,
        bufferPages: true,
        info: {
          Title: document.title,
          Author: document.branding?.legalName ?? document.branding?.name ?? "Centre Hospitalier d'Isiro",
          Subject: 'Export du système de gestion hospitalière',
        },
      });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('error', reject);
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      const width = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
      const baseWidths = document.columns.map((column) =>
        Math.min(150, Math.max(48, column.label.length * 5.5)),
      );
      const scale = width / baseWidths.reduce((sum, value) => sum + value, 0);
      const widths = baseWidths.map((value) => value * scale);
      const accent = document.branding?.accentColor || '#167757';
      const hospitalName =
        document.branding?.legalName ?? document.branding?.name ?? "Centre Hospitalier d'Isiro";
      const logoBuffer = (() => {
        const match = document.branding?.logoDataUrl?.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (!match) return null;
        try {
          return Buffer.from(match[1], 'base64');
        } catch {
          return null;
        }
      })();
      const drawHeader = () => {
        const headerTop = pdf.y;
        if (logoBuffer) {
          try {
            pdf.image(logoBuffer, pdf.page.margins.left, headerTop, { fit: [42, 42] });
          } catch {
            // Un logo invalide ne doit jamais bloquer l'export des données.
          }
        }
        pdf
          .fillColor('#143b35')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(hospitalName, pdf.page.margins.left + (logoBuffer ? 48 : 0), headerTop, {
            width: width - (logoBuffer ? 48 : 0),
            align: 'center',
          });
        pdf
          .fontSize(16)
          .text(document.title, pdf.page.margins.left + (logoBuffer ? 48 : 0), headerTop + 16, {
            width: width - (logoBuffer ? 48 : 0),
            align: 'center',
          });
        const contact = [
          document.branding?.address,
          document.branding?.phone,
          document.branding?.email,
          document.branding?.website,
        ]
          .filter(Boolean)
          .join(' - ');
        if (contact) {
          pdf
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor('#435a57')
            .text(contact, pdf.page.margins.left, headerTop + 35, { width, align: 'center' });
        }
        pdf.y = Math.max(headerTop + 48, pdf.y + 4);
        if (document.metadata?.length) {
          pdf.fontSize(8).font('Helvetica').fillColor('#435a57');
          for (const item of document.metadata) {
            pdf.text(`${item.label}: ${item.value}`, { continued: true }).text('   ');
          }
          pdf.moveDown(0.6);
        }
        const y = pdf.y;
        let x = pdf.page.margins.left;
        pdf.fontSize(7).font('Helvetica-Bold');
        document.columns.forEach((column, index) => {
          pdf.rect(x, y, widths[index], 22).fillAndStroke(accent, '#d6e3e0');
          pdf.fillColor('#ffffff').text(column.label, x + 3, y + 5, { width: widths[index] - 6, height: 15, ellipsis: true });
          x += widths[index];
        });
        pdf.y = y + 22;
      };
      drawHeader();
      document.rows.forEach((row, rowIndex) => {
        const values = document.columns.map((column) => text(row[column.key]));
        const height = Math.max(18, ...values.map((value, index) => pdf.heightOfString(value, { width: widths[index] - 6 }) + 6));
        if (pdf.y + height > pdf.page.height - pdf.page.margins.bottom - 14) {
          pdf.addPage();
          drawHeader();
        }
        const y = pdf.y;
        let x = pdf.page.margins.left;
        document.columns.forEach((column, index) => {
          pdf.rect(x, y, widths[index], height).fillAndStroke(rowIndex % 2 ? '#f7faf9' : '#ffffff', '#d6e3e0');
          pdf.fillColor('#1d2b29').font('Helvetica').fontSize(6.5).text(values[index], x + 3, y + 4, { width: widths[index] - 6, height: height - 6, ellipsis: true });
          x += widths[index];
        });
        pdf.y = y + height;
      });
      const pages = pdf.bufferedPageRange();
      for (let index = 0; index < pages.count; index += 1) {
        pdf.switchToPage(index);
        pdf.fontSize(7).fillColor('#6b7c79').text(`${hospitalName} - ${new Date().toLocaleString('fr-CD')} - Page ${index + 1}/${pages.count}`, pdf.page.margins.left, pdf.page.height - 18, { align: 'center', width });
      }
      pdf.end();
    });
  }
}
