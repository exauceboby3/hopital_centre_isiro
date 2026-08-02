from pathlib import Path

service = Path('apps/api/src/data-exchange/data-exchange.service.ts')
text = service.read_text()
text = text.replace(
    "function clean(value: unknown): string {\n  return String(value ?? '').trim();\n}\n",
    "function clean(value: unknown): string {\n  if (value === null || value === undefined) return '';\n  if (typeof value === 'string') return value.trim();\n  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {\n    return String(value).trim();\n  }\n  if (value instanceof Date) return value.toISOString();\n  return JSON.stringify(value).trim();\n}\n",
)
text = text.replace(
    "  return value && typeof value === 'object' && !Array.isArray(value)\n    ? (value as Record<string, unknown>)\n    : {};\n",
    "  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};\n",
)
text = text.replace("  const parsed = new Date(String(value));\n", "  const parsed = new Date(clean(value));\n")
text = text.replace(
    "            if (String(row.values[field] ?? '') !== String(first.values[field] ?? '')) {\n",
    "            if (clean(row.values[field]) !== clean(first.values[field])) {\n",
)
text = text.replace(
    "        const first = groupRows[0];\n        const itemNames",
    "        const first = groupRows[0];\n        if (!first) continue;\n        const itemNames",
)
text = text.replace(
    "        const [department, businessDate, shift] = key.split('|');\n        const exists",
    "        const [department = '', businessDate = '', shift = ''] = key.split('|');\n        const exists",
)
text = text.replace(
    "        const first = group[0];\n        const metrics",
    "        const first = group[0];\n        if (!first) continue;\n        const metrics",
)
text = text.replace(
    "        const first = group[0];\n        await transaction.internalRequisition.create",
    "        const first = group[0];\n        if (!first) continue;\n        await transaction.internalRequisition.create",
)
service.write_text(text)

codec = Path('apps/api/src/data-exchange/tabular-codec.service.ts')
text = codec.read_text()
text = text.replace(
    "  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';\n  if (typeof value === 'object') return JSON.stringify(value);\n  return String(value);\n",
    "  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';\n  if (typeof value === 'string') return value;\n  if (typeof value === 'number' || typeof value === 'bigint') return String(value);\n  return JSON.stringify(value);\n",
)
text = text.replace(
    "    if (!rows.length) throw new BadRequestException('Aucune ligne exploitable dans le fichier CSV.');\n    const headers = rows[0].map((header) => header.trim());\n",
    "    const [headerRow, ...dataRows] = rows;\n    if (!headerRow) throw new BadRequestException('Aucune ligne exploitable dans le fichier CSV.');\n    const headers = headerRow.map((header) => header.trim());\n",
)
text = text.replace(
    "    const objects = rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));\n",
    "    const objects = dataRows.map((cells) =>\n      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),\n    );\n",
)
text = text.replace(
    "      ? [...strFromU8(sharedBytes).matchAll(/<si[^>]*>([\\s\\S]*?)<\\/si>/g)].map((match) => stripXml(match[1]))\n",
    "      ? [...strFromU8(sharedBytes).matchAll(/<si[^>]*>([\\s\\S]*?)<\\/si>/g)].map((match) =>\n          stripXml(match[1] ?? ''),\n        )\n",
)
text = text.replace(
    "      for (const cellMatch of rowMatch[1].matchAll(/<c\\b([^>]*)>([\\s\\S]*?)<\\/c>/g)) {\n        const attributes = cellMatch[1];\n        const body = cellMatch[2];\n",
    "      const rowBody = rowMatch[1] ?? '';\n      for (const cellMatch of rowBody.matchAll(/<c\\b([^>]*)>([\\s\\S]*?)<\\/c>/g)) {\n        const attributes = cellMatch[1] ?? '';\n        const body = cellMatch[2] ?? '';\n",
)
text = text.replace(
    "    if (!table.length) throw new BadRequestException('La feuille Excel ne contient aucune donnée.');\n    const headers = table[0].map((value) => value.trim());\n    const rows = table.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ''])));\n",
    "    const [headerRow, ...dataRows] = table;\n    if (!headerRow) throw new BadRequestException('La feuille Excel ne contient aucune donnée.');\n    const headers = headerRow.map((value) => value.trim());\n    const rows = dataRows.map((cells) =>\n      Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ''])),\n    );\n",
)
text = text.replace(
    "          return Buffer.from(match[1], 'base64');\n",
    "          return Buffer.from(match[1] ?? '', 'base64');\n",
)
text = text.replace(
    "        document.columns.forEach((column, index) => {\n          pdf.rect(x, y, widths[index], 22).fillAndStroke(accent, '#d6e3e0');\n          pdf.fillColor('#ffffff').text(column.label, x + 3, y + 5, { width: widths[index] - 6, height: 15, ellipsis: true });\n          x += widths[index];\n        });\n",
    "        document.columns.forEach((column, index) => {\n          const columnWidth = widths[index] ?? 48;\n          pdf.rect(x, y, columnWidth, 22).fillAndStroke(accent, '#d6e3e0');\n          pdf.fillColor('#ffffff').text(column.label, x + 3, y + 5, {\n            width: columnWidth - 6,\n            height: 15,\n            ellipsis: true,\n          });\n          x += columnWidth;\n        });\n",
)
text = text.replace(
    "        const height = Math.max(18, ...values.map((value, index) => pdf.heightOfString(value, { width: widths[index] - 6 }) + 6));\n",
    "        const height = Math.max(\n          18,\n          ...values.map(\n            (value, index) =>\n              pdf.heightOfString(value, { width: (widths[index] ?? 48) - 6 }) + 6,\n          ),\n        );\n",
)
text = text.replace(
    "        document.columns.forEach((column, index) => {\n          pdf.rect(x, y, widths[index], height).fillAndStroke(rowIndex % 2 ? '#f7faf9' : '#ffffff', '#d6e3e0');\n          pdf.fillColor('#1d2b29').font('Helvetica').fontSize(6.5).text(values[index], x + 3, y + 4, { width: widths[index] - 6, height: height - 6, ellipsis: true });\n          x += widths[index];\n        });\n",
    "        document.columns.forEach((_column, index) => {\n          const columnWidth = widths[index] ?? 48;\n          pdf\n            .rect(x, y, columnWidth, height)\n            .fillAndStroke(rowIndex % 2 ? '#f7faf9' : '#ffffff', '#d6e3e0');\n          pdf\n            .fillColor('#1d2b29')\n            .font('Helvetica')\n            .fontSize(6.5)\n            .text(values[index] ?? '', x + 3, y + 4, {\n              width: columnWidth - 6,\n              height: height - 6,\n              ellipsis: true,\n            });\n          x += columnWidth;\n        });\n",
)
codec.write_text(text)
