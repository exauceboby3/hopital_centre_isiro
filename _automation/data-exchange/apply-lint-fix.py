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
service.write_text(text)

codec = Path('apps/api/src/data-exchange/tabular-codec.service.ts')
text = codec.read_text()
text = text.replace(
    "  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';\n  if (typeof value === 'object') return JSON.stringify(value);\n  return String(value);\n",
    "  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';\n  if (typeof value === 'string') return value;\n  if (typeof value === 'number' || typeof value === 'bigint') return String(value);\n  return JSON.stringify(value);\n",
)
codec.write_text(text)
