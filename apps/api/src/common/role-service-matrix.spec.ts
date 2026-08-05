import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AdminController } from '../admin/admin.controller';
import { AlertsController } from '../alerts/alerts.controller';
import { AppointmentsController } from '../appointments/appointments.controller';
import { ArchivesController } from '../archives/archives.controller';
import { BillingController } from '../billing/billing.controller';
import { CareVouchersController } from '../billing/care-vouchers.controller';
import { FinancialAuthorizationController } from '../billing/financial-authorization.controller';
import { PatientFinancialAccessController } from '../billing/patient-financial-access.controller';
import { BusinessNotificationsController } from '../business-notifications/business-notifications.controller';
import { ClinicalGovernanceController } from '../clinical-governance/clinical-governance.controller';
import { ClinicalSafetyController } from '../clinical-safety/clinical-safety.controller';
import { ConfigurationController } from '../configuration/configuration.controller';
import { ConsultationsController } from '../consultations/consultations.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DataExchangeController } from '../data-exchange/data-exchange.controller';
import { EnterpriseController } from '../enterprise/enterprise.controller';
import { HospitalizationsController } from '../hospitalizations/hospitalizations.controller';
import { LaboratoryRequestPrintController } from '../laboratory/laboratory-request-print.controller';
import { LaboratoryController } from '../laboratory/laboratory.controller';
import { MessagesController } from '../messages/messages.controller';
import { NursingController } from '../nursing/nursing.controller';
import { OperationsController } from '../operations/operations.controller';
import { PatientsController } from '../patients/patients.controller';
import { PharmacyController } from '../pharmacy/pharmacy.controller';
import { PushNotificationsController } from '../push-notifications/push-notifications.controller';
import { ServiceReportsController } from '../service-reports/service-reports.controller';
import { StaffController } from '../staff/staff.controller';
import { UsersController } from '../users/users.controller';
import { effectiveRoles } from './authenticated-user';
import { ROLES_KEY } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

type ControllerClass = abstract new (...args: never[]) => unknown;

interface EndpointDefinition {
  controller: string;
  handler: string;
  method: RequestMethod;
  path: string;
  roles?: Role[];
}

const controllers: ControllerClass[] = [
  AdminController,
  AlertsController,
  AppointmentsController,
  ArchivesController,
  BillingController,
  CareVouchersController,
  FinancialAuthorizationController,
  PatientFinancialAccessController,
  BusinessNotificationsController,
  ClinicalGovernanceController,
  ClinicalSafetyController,
  ConfigurationController,
  ConsultationsController,
  DashboardController,
  DataExchangeController,
  EnterpriseController,
  HospitalizationsController,
  LaboratoryRequestPrintController,
  LaboratoryController,
  MessagesController,
  NursingController,
  OperationsController,
  PatientsController,
  PharmacyController,
  PushNotificationsController,
  ServiceReportsController,
  StaffController,
  UsersController,
];

const allRoles = Object.values(Role);

function normalizePath(...parts: Array<string | string[] | undefined>): string {
  return parts
    .flatMap((part) => (Array.isArray(part) ? part : [part]))
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('/')
    .replaceAll(/\/{2,}/g, '/')
    .replace(/^|$/g, '/');
}

function endpointDefinitions(): EndpointDefinition[] {
  return controllers.flatMap((controller) => {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) as
      string | string[] | undefined;
    const controllerRoles = Reflect.getMetadata(ROLES_KEY, controller) as Role[] | undefined;
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).flatMap((handler) => {
      if (handler === 'constructor') return [];
      const method = prototype[handler];
      if (typeof method !== 'function') return [];
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, method) as
        RequestMethod | undefined;
      if (requestMethod === undefined) return [];
      const methodPath = Reflect.getMetadata(PATH_METADATA, method) as
        string | string[] | undefined;
      const methodRoles = Reflect.getMetadata(ROLES_KEY, method) as Role[] | undefined;
      return [
        {
          controller: controller.name,
          handler,
          method: requestMethod,
          path: normalizePath(controllerPath, methodPath),
          roles: methodRoles ?? controllerRoles,
        },
      ];
    });
  });
}

function canCall(role: Role, endpoint: EndpointDefinition): boolean {
  if (role === Role.SUPER_ADMIN || !endpoint.roles?.length) return true;
  const granted = effectiveRoles({ role, additionalRoles: [] });
  return endpoint.roles.some((required) => granted.includes(required));
}

const endpoints = endpointDefinitions();

describe('matrice exhaustive rôles × services API', () => {
  it('recense tous les rôles Prisma sans omission', () => {
    expect(allRoles).toHaveLength(16);
    expect(new Set(allRoles)).toEqual(new Set(Object.values(Role)));
  });

  it('recense chaque route déclarée des contrôleurs authentifiés', () => {
    expect(controllers).toHaveLength(28);
    expect(endpoints.length).toBeGreaterThan(150);
    expect(
      new Set(endpoints.map((endpoint) => `${RequestMethod[endpoint.method]} ${endpoint.path}`))
        .size,
    ).toBe(endpoints.length);
  });

  it.each(controllers.map((controller) => [controller.name, controller] as const))(
    '%s est protégé par JwtAuthGuard',
    (_name, controller) => {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, controller) ?? []) as unknown[];
      expect(guards).toContain(JwtAuthGuard);
    },
  );

  it.each(allRoles)('%s possède une matrice complète de décisions', (role) => {
    const decisions = endpoints.map((endpoint) => ({ endpoint, allowed: canCall(role, endpoint) }));
    expect(decisions).toHaveLength(endpoints.length);
    expect(decisions.some((decision) => decision.allowed)).toBe(true);
    if (role === Role.SUPER_ADMIN) {
      expect(decisions.every((decision) => decision.allowed)).toBe(true);
    } else {
      expect(decisions.some((decision) => !decision.allowed)).toBe(true);
    }
  });

  it('accorde à chaque métier son service principal', () => {
    const expectedPrefixes: Record<Role, string> = {
      SUPER_ADMIN: '/admin/',
      ADMIN: '/admin/',
      CASHIER: '/billing/',
      RECEPTIONIST: '/appointments/',
      SECRETARY: '/appointments/',
      DOCTOR: '/consultations/',
      NURSE: '/nursing-care/',
      LAB_TECHNICIAN: '/laboratory/exams/',
      MEDICAL_BIOLOGIST: '/laboratory/exams/',
      RADIOLOGIST: '/enterprise/radiology/',
      SURGEON: '/consultations/',
      MIDWIFE: '/consultations/',
      PHARMACIST: '/pharmacy/medications/',
      ACCOUNTANT: '/billing/',
      STOREKEEPER: '/pharmacy/medications/',
      HR: '/staff/',
    };

    for (const role of allRoles) {
      expect(
        endpoints.some(
          (endpoint) => endpoint.path.startsWith(expectedPrefixes[role]) && canCall(role, endpoint),
        ),
      ).toBe(true);
    }
  });

  it('fait hériter au biologiste toutes les permissions du technicien de laboratoire', () => {
    for (const endpoint of endpoints) {
      if (canCall(Role.LAB_TECHNICIAN, endpoint)) {
        expect(canCall(Role.MEDICAL_BIOLOGIST, endpoint)).toBe(true);
      }
    }
  });

  it('refuse aux métiers cliniques les écrans financiers détaillés', () => {
    const detailedBilling = endpoints.filter((endpoint) =>
      endpoint.path.startsWith('/billing/invoices/'),
    );
    expect(detailedBilling.length).toBeGreaterThan(0);
    for (const role of [Role.DOCTOR, Role.NURSE, Role.LAB_TECHNICIAN, Role.RADIOLOGIST]) {
      expect(detailedBilling.every((endpoint) => !canCall(role, endpoint))).toBe(true);
    }
  });
});
