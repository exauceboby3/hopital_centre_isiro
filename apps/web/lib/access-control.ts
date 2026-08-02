import { effectiveRoles, hasAnyRole } from './roles';
import { Role, User } from './types';

export const ALL_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'CASHIER',
  'RECEPTIONIST',
  'SECRETARY',
  'DOCTOR',
  'NURSE',
  'LAB_TECHNICIAN',
  'MEDICAL_BIOLOGIST',
  'RADIOLOGIST',
  'SURGEON',
  'MIDWIFE',
  'PHARMACIST',
  'ACCOUNTANT',
  'STOREKEEPER',
  'HR',
];

export const ADMIN_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN'];
export const HR_ROLES: readonly Role[] = ['SUPER_ADMIN', 'ADMIN', 'HR'];
export const SERVICE_REPORT_ROLES: readonly Role[] = ALL_ROLES;
export const RECEPTION_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTIONIST',
  'SECRETARY',
];
export const CLINICIAN_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'SURGEON',
  'MIDWIFE',
];
export const NURSING_ROLES: readonly Role[] = [...CLINICIAN_ROLES, 'NURSE'];
export const BILLING_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'RECEPTIONIST',
  'SECRETARY',
  'CASHIER',
  'ACCOUNTANT',
];
export const HOSPITALIZATION_ROLES: readonly Role[] = [
  ...CLINICIAN_ROLES,
  'RECEPTIONIST',
  'SECRETARY',
  'NURSE',
];
export const LABORATORY_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'LAB_TECHNICIAN',
  'MEDICAL_BIOLOGIST',
];
export const PHARMACY_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'PHARMACIST',
  'STOREKEEPER',
];
export const PATIENT_DIRECTORY_ROLES: readonly Role[] = [
  ...RECEPTION_ROLES,
  ...CLINICIAN_ROLES,
  'MEDICAL_BIOLOGIST',
  'RADIOLOGIST',
];
export const PATIENT_ACCOUNT_ROLES: readonly Role[] = [
  ...BILLING_ROLES,
  'DOCTOR',
  'SURGEON',
  'MIDWIFE',
];
export const EMERGENCY_ACCESS_ROLES: readonly Role[] = [
  'DOCTOR',
  'NURSE',
  'SURGEON',
  'MIDWIFE',
];
export const OPERATIONS_ROLES: readonly Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'DOCTOR',
  'LAB_TECHNICIAN',
  'MEDICAL_BIOLOGIST',
  'RADIOLOGIST',
  'SURGEON',
  'MIDWIFE',
  'PHARMACIST',
  'STOREKEEPER',
];
export const ENTERPRISE_ROLES: readonly Role[] = [
  ...CLINICIAN_ROLES,
  'PHARMACIST',
  'STOREKEEPER',
  'RADIOLOGIST',
  'ACCOUNTANT',
  'HR',
];

interface RouteRule {
  prefix: string;
  roles: readonly Role[];
}

const routeRules: RouteRule[] = [
  { prefix: '/quality-continuity', roles: ADMIN_ROLES },
  { prefix: '/security-settings', roles: ADMIN_ROLES },
  { prefix: '/clinical-safety', roles: ADMIN_ROLES },
  { prefix: '/doctor-waiting-room', roles: CLINICIAN_ROLES },
  { prefix: '/medication-administration', roles: NURSING_ROLES },
  { prefix: '/financial-assistance', roles: BILLING_ROLES },
  { prefix: '/clinical-governance', roles: PATIENT_ACCOUNT_ROLES },
  { prefix: '/emergency-access', roles: EMERGENCY_ACCESS_ROLES },
  { prefix: '/care-vouchers', roles: BILLING_ROLES },
  { prefix: '/hospitalizations', roles: HOSPITALIZATION_ROLES },
  { prefix: '/appointments', roles: RECEPTION_ROLES },
  { prefix: '/consultations', roles: CLINICIAN_ROLES },
  { prefix: '/laboratory', roles: LABORATORY_ROLES },
  { prefix: '/nursing', roles: NURSING_ROLES },
  { prefix: '/patients', roles: PATIENT_DIRECTORY_ROLES },
  { prefix: '/archives', roles: ADMIN_ROLES },
  { prefix: '/billing', roles: BILLING_ROLES },
  { prefix: '/pharmacy', roles: PHARMACY_ROLES },
  { prefix: '/operations', roles: OPERATIONS_ROLES },
  { prefix: '/enterprise', roles: ENTERPRISE_ROLES },
  { prefix: '/service-reports', roles: SERVICE_REPORT_ROLES },
  { prefix: '/staff', roles: HR_ROLES },
  { prefix: '/admin', roles: ADMIN_ROLES },
  { prefix: '/dashboard', roles: ALL_ROLES },
  { prefix: '/messages', roles: ALL_ROLES },
  { prefix: '/profile', roles: ALL_ROLES },
  { prefix: '/print', roles: ALL_ROLES },
].sort((left, right) => right.prefix.length - left.prefix.length);

export function rolesForPath(pathname: string): readonly Role[] | null {
  return routeRules.find(
    (rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`),
  )?.roles ?? null;
}

export function canAccessPath(
  user: Pick<User, 'role' | 'additionalRoles'> | null | undefined,
  pathname: string,
): boolean {
  const requiredRoles = rolesForPath(pathname);
  return requiredRoles ? hasAnyRole(user, requiredRoles) : true;
}

export function defaultRouteForUser(
  user: Pick<User, 'role' | 'additionalRoles'>,
): string {
  const roles = effectiveRoles(user);
  if (roles.includes('SUPER_ADMIN') || roles.includes('ADMIN')) return '/dashboard';
  if (roles.some((role) => ['RECEPTIONIST', 'SECRETARY'].includes(role))) return '/appointments';
  if (roles.includes('CASHIER') || roles.includes('ACCOUNTANT')) return '/billing';
  if (roles.includes('DOCTOR') || roles.includes('SURGEON') || roles.includes('MIDWIFE')) {
    return '/doctor-waiting-room';
  }
  if (roles.includes('NURSE')) return '/nursing';
  if (roles.includes('MEDICAL_BIOLOGIST') || roles.includes('LAB_TECHNICIAN')) {
    return '/laboratory';
  }
  if (roles.includes('PHARMACIST') || roles.includes('STOREKEEPER')) return '/pharmacy';
  if (roles.includes('HR')) return '/staff';
  if (roles.includes('RADIOLOGIST')) return '/operations';
  return '/dashboard';
}
