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

// IANA has no Africa/Isiro identifier. Africa/Lubumbashi is the official
// identifier for eastern DR Congo (CAT, UTC+2), including Isiro.
const ISIRO_TIME_ZONE = 'Africa/Lubumbashi';
const ISIRO_UTC_OFFSET = '+02:00';

export function localDateTimeInputValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISIRO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

export function isiroLocalDateTimeToDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(Number.NaN);
  return new Date(`${value}:00.000${ISIRO_UTC_OFFSET}`);
}

export function formatHospitalTime(value?: string | Date | null, empty = 'Non signée'): string {
  if (!value) return empty;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: ISIRO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function hospitalDateKey(value: string | Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISIRO_TIME_ZONE,
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
