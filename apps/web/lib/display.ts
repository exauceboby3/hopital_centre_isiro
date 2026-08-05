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

const HOSPITAL_TIME_ZONE = 'Africa/Lubumbashi';

export function formatHospitalTime(value?: string | Date | null, empty = 'Non signée'): string {
  if (!value) return empty;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: HOSPITAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function hospitalDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOSPITAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, ' ')
    .trim();
}
