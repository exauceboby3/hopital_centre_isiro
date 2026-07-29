import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { ArchivesController } from './archives.controller';

describe('ArchivesController', () => {
  const routeRoles = (method: 'archive' | 'restore' | 'updatePolicy') => {
    const handler = Object.getOwnPropertyDescriptor(ArchivesController.prototype, method)?.value as
      object | undefined;
    if (!handler) throw new Error(`Route d'archives ${method} introuvable.`);
    return Reflect.getMetadata(ROLES_KEY, handler) as Role[];
  };

  it.each(['archive', 'restore', 'updatePolicy'] as const)(
    'réserve %s au super-administrateur',
    (method) => {
      expect(routeRoles(method)).toEqual([Role.SUPER_ADMIN]);
      expect(routeRoles(method)).not.toContain(Role.ADMIN);
    },
  );

  it('autorise la consultation des archives aux rôles prévus', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, ArchivesController) as Role[];
    expect(roles).toEqual([Role.SUPER_ADMIN, Role.ADMIN]);
  });
});
