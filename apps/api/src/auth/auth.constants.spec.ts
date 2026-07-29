import { durationToSeconds } from './auth.constants';

describe('durationToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['7d', 604800],
  ])('convertit %s en secondes', (value, expected) => {
    expect(durationToSeconds(value, 1)).toBe(expected);
  });

  it('utilise la valeur de secours si le format est invalide', () => {
    expect(durationToSeconds('invalide', 900)).toBe(900);
  });
});
