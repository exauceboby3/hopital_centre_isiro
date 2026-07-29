import { Role } from '@prisma/client';

export function canManagePrivilegedRole(actor: Role, target: Role, next?: Role): boolean {
  return actor === Role.SUPER_ADMIN || (target !== Role.SUPER_ADMIN && next !== Role.SUPER_ADMIN);
}

export function wouldRemoveLastSuperAdmin(
  currentRole: Role,
  nextRole: Role | undefined,
  nextActive: boolean | undefined,
  activeSuperAdmins: number,
): boolean {
  const removesPrivilege =
    currentRole === Role.SUPER_ADMIN &&
    ((nextRole !== undefined && nextRole !== Role.SUPER_ADMIN) || nextActive === false);
  return removesPrivilege && activeSuperAdmins <= 1;
}
