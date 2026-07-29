export function patientName(patient: {
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
}): string {
  return [patient.lastName, patient.postName, patient.firstName].filter(Boolean).join(' ');
}

export function currency(value: number | string): string {
  return `${Number(value).toLocaleString('fr-CD')} CDF`;
}

export function matchesSearch(query: string, ...values: unknown[]): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return normalizeSearchText(
    values.filter((value) => value !== undefined && value !== null).join(' '),
  ).includes(needle);
}

export function localDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')
    .trim();
}
