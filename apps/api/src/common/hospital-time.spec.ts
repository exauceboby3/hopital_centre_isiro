import { hospitalCalendarYear, hospitalDayRange } from './hospital-time';

describe('hospital-time', () => {
  const previous = process.env.HOSPITAL_UTC_OFFSET_MINUTES;

  afterEach(() => {
    if (previous === undefined) delete process.env.HOSPITAL_UTC_OFFSET_MINUTES;
    else process.env.HOSPITAL_UTC_OFFSET_MINUTES = previous;
  });

  it('calcule minuit hospitalier UTC+2 sans dépendre du fuseau du serveur', () => {
    process.env.HOSPITAL_UTC_OFFSET_MINUTES = '120';
    const { start, end } = hospitalDayRange(new Date('2026-08-02T22:30:00.000Z'));
    expect(start.toISOString()).toBe('2026-08-02T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-03T22:00:00.000Z');
    expect(hospitalCalendarYear(new Date('2025-12-31T22:30:00.000Z'))).toBe(2026);
  });
});
