import { ALL_ROLES, canAccessPath, defaultRouteForUser, rolesForPath } from './access-control';

const protectedPaths = [
  '/admin',
  '/appointments',
  '/archives',
  '/billing',
  '/care-vouchers',
  '/clinical-governance',
  '/clinical-safety',
  '/consultations',
  '/dashboard',
  '/data-exchange',
  '/doctor-waiting-room',
  '/emergency-access',
  '/enterprise',
  '/financial-assistance',
  '/hospitalizations',
  '/laboratory',
  '/medication-administration',
  '/messages',
  '/nursing',
  '/operations',
  '/patients',
  '/pharmacy',
  '/print',
  '/profile',
  '/quality-continuity',
  '/security-settings',
  '/service-reports',
  '/staff',
] as const;

const user = (role: Parameters<typeof defaultRouteForUser>[0]['role']) => ({
  role,
  additionalRoles: [],
});

describe('access-control', () => {
  it.each(ALL_ROLES)('oriente %s vers une page qui lui est autorisée', (role) => {
    const account = user(role);
    expect(canAccessPath(account, defaultRouteForUser(account))).toBe(true);
  });

  it.each(protectedPaths)('déclare une politique de rôles pour %s', (path) => {
    expect(rolesForPath(path)).not.toBeNull();
    expect(rolesForPath(path)?.length).toBeGreaterThan(0);
  });

  for (const role of ALL_ROLES) {
    it(`applique toutes les politiques de pages au rôle ${role}`, () => {
      const account = user(role);
      for (const path of protectedPaths) {
        expect(canAccessPath(account, path)).toBe(rolesForPath(path)?.includes(role));
      }
    });
  }

  it('cache la gestion des rendez-vous au médecin', () => {
    expect(canAccessPath(user('DOCTOR'), '/appointments')).toBe(false);
    expect(canAccessPath(user('DOCTOR'), '/doctor-waiting-room')).toBe(true);
  });

  it('ouvre la préparation des rendez-vous à la caisse sans l’ouvrir à la comptabilité', () => {
    expect(canAccessPath(user('CASHIER'), '/appointments')).toBe(true);
    expect(canAccessPath(user('ACCOUNTANT'), '/appointments')).toBe(false);
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

  it('ouvre le dossier et les hospitalisations aux métiers qui en ont besoin', () => {
    expect(canAccessPath(user('NURSE'), '/patients')).toBe(true);
    expect(canAccessPath(user('NURSE'), '/enterprise')).toBe(true);
    expect(canAccessPath(user('CASHIER'), '/patients')).toBe(true);
    expect(canAccessPath(user('CASHIER'), '/operations')).toBe(true);
    expect(canAccessPath(user('ACCOUNTANT'), '/hospitalizations')).toBe(true);
  });

  it('réserve les écrans financiers détaillés à la caisse, la comptabilité et l’administration', () => {
    expect(canAccessPath(user('CASHIER'), '/billing')).toBe(true);
    expect(canAccessPath(user('ACCOUNTANT'), '/financial-assistance')).toBe(true);
    expect(canAccessPath(user('RECEPTIONIST'), '/billing')).toBe(false);
    expect(canAccessPath(user('DOCTOR'), '/care-vouchers')).toBe(false);
  });

  it('donne au rôle RH le personnel et les rapports sans accès clinique ni pharmacie', () => {
    expect(canAccessPath(user('HR'), '/staff')).toBe(true);
    expect(canAccessPath(user('HR'), '/service-reports')).toBe(true);
    expect(canAccessPath(user('HR'), '/enterprise')).toBe(true);
    expect(canAccessPath(user('HR'), '/patients')).toBe(false);
    expect(canAccessPath(user('HR'), '/pharmacy')).toBe(false);
    expect(defaultRouteForUser(user('HR'))).toBe('/staff');
  });
});
