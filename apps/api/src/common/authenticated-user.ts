import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: Role;
  additionalRoles: Role[];
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  role: Role;
}

export interface RefreshTokenPayload extends AccessTokenPayload {
  sid: string;
}

export function effectiveRoles(user: Pick<AuthenticatedUser, 'role' | 'additionalRoles'>): Role[] {
  const roles = [...new Set([user.role, ...(user.additionalRoles ?? [])])];
  if (roles.includes(Role.MEDICAL_BIOLOGIST) && !roles.includes(Role.LAB_TECHNICIAN)) {
    roles.push(Role.LAB_TECHNICIAN);
  }
  return roles;
}

export function hasAnyRole(
  user: Pick<AuthenticatedUser, 'role' | 'additionalRoles'>,
  roles: readonly Role[],
): boolean {
  return effectiveRoles(user).some((role) => roles.includes(role));
}
