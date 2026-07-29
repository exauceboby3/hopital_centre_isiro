import { canAccessPath, defaultRouteForUser } from './access-control';

const user = (role: Parameters<typeof defaultRouteForUser>[0]['role']) => ({
  role,
  additionalRoles: [],
});

describe('access-control', () => {
  it('cache la gestion des rendez-vous au médecin', () => {
    expect(canAccessPath(user('DOCTOR'), '/appointments')).toBe(false);
    expect(canAccessPath(user('DOCTOR'), '/doctor-waiting-room')).toBe(true);
  });

  it('réserve les centres transversaux aux administrateurs', () => {
    expect(canAccessPath(user('ADMIN'), '/quality-continuity')).toBe(true);
    expect(canAccessPath(user('ADMIN'), '/clinical-safety')).toBe(true);
    expect(canAccessPath(user('NURSE'), '/quality-continuity')).toBe(false);
    expect(canAccessPath(user('DOCTOR'), '/clinical-safety')).toBe(false);
    expect(canAccessPath(user('ACCOUNTANT'), '/security-settings')).toBe(false);
  });

  it('oriente chaque métier vers son espace de travail principal', () => {
    expect(defaultRouteForUser(user('RECEPTIONIST'))).toBe('/appointments');
    expect(defaultRouteForUser(user('DOCTOR'))).toBe('/doctor-waiting-room');
    expect(defaultRouteForUser(user('NURSE'))).toBe('/nursing');
    expect(defaultRouteForUser(user('LAB_TECHNICIAN'))).toBe('/laboratory');
    expect(defaultRouteForUser(user('PHARMACIST'))).toBe('/pharmacy');
  });

  it('tient compte des rôles additionnels', () => {
    const administratorDoctor = { role: 'ADMIN' as const, additionalRoles: ['DOCTOR' as const] };
    expect(canAccessPath(administratorDoctor, '/consultations')).toBe(true);
    expect(canAccessPath(administratorDoctor, '/admin')).toBe(true);
  });
});
