import {
  ATTENDANCE_END_MINUTES,
  canSignAttendanceExit,
  classifyLoginAttendance,
  durationToSeconds,
  hospitalAttendanceMoment,
  hospitalUtcOffsetMinutes,
} from './auth.constants';

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

describe('pointage automatique des présences', () => {
  it('valide le décalage UTC configuré pour l’hôpital', () => {
    expect(hospitalUtcOffsetMinutes('120')).toBe(120);
    expect(hospitalUtcOffsetMinutes('invalide')).toBe(120);
  });

  it.each([
    ['07h29', 7 * 60 + 29],
    ['07h30', 7 * 60 + 30],
    ['09h30', 9 * 60 + 30],
  ])('considère la première connexion à %s comme présente', (_label, localMinutes) => {
    expect(classifyLoginAttendance(localMinutes)).toEqual({
      status: 'PRESENT',
      minutesLate: 0,
    });
  });

  it('calcule le retard à partir de la fin de la fenêtre de pointage', () => {
    expect(classifyLoginAttendance(9 * 60 + 31)).toEqual({
      status: 'LATE',
      minutesLate: 1,
    });
    expect(classifyLoginAttendance(10 * 60)).toEqual({
      status: 'LATE',
      minutesLate: 30,
    });
  });

  it('utilise le jour civil d’Isiro même lorsque UTC est encore au jour précédent', () => {
    const moment = hospitalAttendanceMoment(new Date('2026-08-05T22:30:00.000Z'), 120);

    expect(moment.attendanceDate.toISOString()).toBe('2026-08-06T00:00:00.000Z');
    expect(moment.localMinutes).toBe(30);
  });

  it('autorise la signature de sortie uniquement à partir de 16h00', () => {
    expect(canSignAttendanceExit(ATTENDANCE_END_MINUTES - 1)).toBe(false);
    expect(canSignAttendanceExit(ATTENDANCE_END_MINUTES)).toBe(true);
  });
});
