import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { PatientsController } from './patients.controller';

describe('PatientsController', () => {
  const routeRoles = (method: 'update' | 'remove' | 'removePermanently') => {
    const handler = Object.getOwnPropertyDescriptor(PatientsController.prototype, method)?.value as
      | object
      | undefined;
    if (!handler) throw new Error(`Route patient ${method} introuvable.`);
    return Reflect.getMetadata(ROLES_KEY, handler) as Role[];
  };

  it('réserve la suppression définitive au super-administrateur', () => {
    expect(routeRoles('removePermanently')).toEqual([Role.SUPER_ADMIN]);
  });

  it('autorise l’administrateur à déplacer un patient dans la corbeille', () => {
    expect(routeRoles('remove')).toEqual([Role.SUPER_ADMIN, Role.ADMIN]);
  });

  it('réserve la correction démographique aux rôles administratifs habilités', () => {
    expect(routeRoles('update')).toEqual([
      Role.SUPER_ADMIN,
      Role.ADMIN,
      Role.RECEPTIONIST,
      Role.SECRETARY,
    ]);
  });
});
