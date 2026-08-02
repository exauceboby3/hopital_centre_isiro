import { Role, User } from './types';

export const roleLabels: Record<Role, string> = {
  SUPER_ADMIN: 'Super-administrateur',
  ADMIN: 'Administrateur',
  CASHIER: 'Caissier',
  RECEPTIONIST: 'Accueil / Réception',
  SECRETARY: 'Accueil / Réception',
  DOCTOR: 'Médecin',
  NURSE: 'Infirmier',
  LAB_TECHNICIAN: 'Technicien de laboratoire',
  MEDICAL_BIOLOGIST: 'Biologiste médical',
  RADIOLOGIST: 'Radiologue',
  SURGEON: 'Chirurgien',
  MIDWIFE: 'Sage-femme',
  PHARMACIST: 'Pharmacien',
  ACCOUNTANT: 'Comptable',
  STOREKEEPER: 'Gestionnaire de stock',
  HR: 'Ressources humaines',
};

export const assignableAdditionalRoles = (Object.keys(roleLabels) as Role[]).filter(
  (role) => role !== 'SUPER_ADMIN' && role !== 'ADMIN' && role !== 'SECRETARY',
);

export function effectiveRoles(user?: Pick<User, 'role' | 'additionalRoles'> | null): Role[] {
  if (!user) return [];
  const roles = [...new Set([user.role, ...(user.additionalRoles ?? [])])];
  if (roles.includes('MEDICAL_BIOLOGIST') && !roles.includes('LAB_TECHNICIAN')) {
    roles.push('LAB_TECHNICIAN');
  }
  return roles;
}

export function hasAnyRole(
  user: Pick<User, 'role' | 'additionalRoles'> | null | undefined,
  roles: readonly Role[],
): boolean {
  return effectiveRoles(user).some((role) => roles.includes(role));
}

export function hasRole(
  user: Pick<User, 'role' | 'additionalRoles'> | null | undefined,
  role: Role,
): boolean {
  return hasAnyRole(user, [role]);
}
