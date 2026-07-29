export const ACCESS_COOKIE = 'hospital_access';
export const REFRESH_COOKIE = 'hospital_refresh';

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
