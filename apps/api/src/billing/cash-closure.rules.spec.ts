import { businessDayRange } from './cash-closure.rules';

describe('clôture journalière de caisse', () => {
  it('utilise la journée civile du Centre hospitalier en UTC+2', () => {
    const range = businessDayRange('2026-07-16');
    expect(range?.businessDate.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(range?.start.toISOString()).toBe('2026-07-15T22:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-07-16T22:00:00.000Z');
  });

  it('refuse une date inexistante ou mal formée', () => {
    expect(businessDayRange('16/07/2026')).toBeNull();
    expect(businessDayRange('2026-02-30')).toBeNull();
  });
});
