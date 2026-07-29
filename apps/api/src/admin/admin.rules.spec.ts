import { Role } from '@prisma/client';
import { canManagePrivilegedRole, wouldRemoveLastSuperAdmin } from './admin.rules';

describe('règles de super-administration', () => {
  it('interdit à un administrateur de gérer ou de créer un super-administrateur', () => {
    expect(canManagePrivilegedRole(Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
    expect(canManagePrivilegedRole(Role.ADMIN, Role.ADMIN, Role.SUPER_ADMIN)).toBe(false);
  });

  it('autorise le super-administrateur à gérer les rôles privilégiés', () => {
    expect(canManagePrivilegedRole(Role.SUPER_ADMIN, Role.SUPER_ADMIN, Role.ADMIN)).toBe(true);
  });

  it('protège le dernier super-administrateur actif', () => {
    expect(wouldRemoveLastSuperAdmin(Role.SUPER_ADMIN, Role.ADMIN, undefined, 1)).toBe(true);
    expect(wouldRemoveLastSuperAdmin(Role.SUPER_ADMIN, undefined, false, 2)).toBe(false);
  });
});
