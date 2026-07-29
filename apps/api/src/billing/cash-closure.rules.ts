export interface BusinessDayRange {
  businessDate: Date;
  start: Date;
  end: Date;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function businessDayRange(value: string): BusinessDayRange | null {
  if (!DATE_PATTERN.test(value)) return null;
  const businessDate = new Date(`${value}T00:00:00.000Z`);
  const start = new Date(`${value}T00:00:00+02:00`);
  if (Number.isNaN(businessDate.getTime()) || Number.isNaN(start.getTime())) return null;
  if (businessDate.toISOString().slice(0, 10) !== value) return null;
  return { businessDate, start, end: new Date(start.getTime() + 86_400_000) };
}
