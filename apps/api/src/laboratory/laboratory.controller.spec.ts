import { Role } from '@prisma/client';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { LaboratoryController } from './laboratory.controller';

describe('LaboratoryController', () => {
  const routeRoles = (method: 'complete' | 'validate' | 'reject') => {
    const handler = Object.getOwnPropertyDescriptor(LaboratoryController.prototype, method)
      ?.value as object | undefined;
    if (!handler) throw new Error(`Route de laboratoire ${method} introuvable.`);
    return Reflect.getMetadata(ROLES_KEY, handler) as Role[];
  };

  it('autorise le technicien et le biologiste à saisir le résultat', () => {
    expect(routeRoles('complete')).toEqual([Role.LAB_TECHNICIAN, Role.MEDICAL_BIOLOGIST]);
  });

  it.each(['validate', 'reject'] as const)('réserve %s au biologiste médical', (method) => {
    expect(routeRoles(method)).toEqual([Role.MEDICAL_BIOLOGIST]);
    expect(routeRoles(method)).not.toContain(Role.LAB_TECHNICIAN);
  });
});
