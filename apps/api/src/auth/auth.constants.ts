export const ACCESS_COOKIE = 'hospital_access';
export const REFRESH_COOKIE = 'hospital_refresh';
export const ATTENDANCE_START_MINUTES = 7 * 60 + 30;
export const ATTENDANCE_GRACE_END_MINUTES = 9 * 60 + 30;
export const ATTENDANCE_END_MINUTES = 16 * 60;

export interface HospitalAttendanceMoment {
  attendanceDate: Date;
  localMinutes: number;
}

export interface LoginAttendanceClassification {
  status: 'PRESENT' | 'LATE';
  minutesLate: number;
}

export function hospitalUtcOffsetMinutes(value: unknown, fallback = 120): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= -720 && parsed <= 840 ? parsed : fallback;
}

export function hospitalAttendanceMoment(
  now: Date,
  utcOffsetMinutes: number,
): HospitalAttendanceMoment {
  const hospitalTime = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  return {
    attendanceDate: new Date(
      Date.UTC(
        hospitalTime.getUTCFullYear(),
        hospitalTime.getUTCMonth(),
        hospitalTime.getUTCDate(),
      ),
    ),
    localMinutes: hospitalTime.getUTCHours() * 60 + hospitalTime.getUTCMinutes(),
  };
}

export function classifyLoginAttendance(localMinutes: number): LoginAttendanceClassification {
  if (localMinutes <= ATTENDANCE_GRACE_END_MINUTES) {
    return { status: 'PRESENT', minutesLate: 0 };
  }
  return {
    status: 'LATE',
    minutesLate: localMinutes - ATTENDANCE_GRACE_END_MINUTES,
  };
}

export function canSignAttendanceExit(localMinutes: number): boolean {
  return localMinutes >= ATTENDANCE_END_MINUTES;
}

export function durationToSeconds(value: string, fallback: number): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return fallback;
  }

  const amount = Number(match[1] ?? 0);
  const unit = match[2] ?? 's';
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multipliers[unit] ?? 1);
}
