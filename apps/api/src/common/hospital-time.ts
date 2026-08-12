import { Prisma } from '@prisma/client';

const DEFAULT_HOSPITAL_UTC_OFFSET_MINUTES = 120;

export const OPERATIONAL_CYCLE_RESET_ACTION = 'OPERATIONAL_CYCLE_RESET';
export const OPERATIONAL_CYCLE_MARKER_QUERY = {
  where: { action: OPERATIONAL_CYCLE_RESET_ACTION },
  select: { createdAt: true },
  orderBy: { createdAt: 'desc' },
} satisfies Prisma.AuditLogFindFirstArgs;

function offsetMinutes() {
  const configured = Number(process.env.HOSPITAL_UTC_OFFSET_MINUTES);
  return Number.isFinite(configured) ? configured : DEFAULT_HOSPITAL_UTC_OFFSET_MINUTES;
}

/**
 * Returns the UTC boundaries of the calendar day used by the hospital.
 * Isiro and Lubumbashi are UTC+2 all year; the offset is configurable for deployment.
 */
export function hospitalDayRange(reference = new Date()) {
  const offset = offsetMinutes();
  const shifted = new Date(reference.getTime() + offset * 60_000);
  const startShiftedUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  const start = new Date(startShiftedUtc - offset * 60_000);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

export function hospitalCalendarYear(reference = new Date()) {
  const offset = offsetMinutes();
  return new Date(reference.getTime() + offset * 60_000).getUTCFullYear();
}
