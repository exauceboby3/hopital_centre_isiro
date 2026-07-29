import { Role } from '@prisma/client';
import { effectiveRoles, hasAnyRole } from './authenticated-user';

describe('rôles cumulés', () => {
  const user = {
    id: 'user-1',
    username: 'accueil',
    role: Role.NURSE,
    additionalRoles: [Role.RECEPTIONIST, Role.CASHIER],
  };

  it('conserve le rôle principal et ajoute les rôles supplémentaires sans doublon', () => {
    expect(effectiveRoles({ ...user, additionalRoles: [Role.NURSE, Role.RECEPTIONIST] })).toEqual([
      Role.NURSE,
      Role.RECEPTIONIST,
    ]);
  });

  it('autorise une fonctionnalité attribuée à un rôle supplémentaire', () => {
    expect(hasAnyRole(user, [Role.RECEPTIONIST])).toBe(true);
    expect(hasAnyRole(user, [Role.CASHIER])).toBe(true);
  });

  it('refuse les fonctionnalités qui ne correspondent à aucun rôle', () => {
    expect(hasAnyRole(user, [Role.SUPER_ADMIN, Role.DOCTOR])).toBe(false);
  });
});
