import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, effectiveRoles } from '../authenticated-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const userRoles = effectiveRoles(request.user);
    if (userRoles.includes(Role.SUPER_ADMIN)) return true;
    const superAdminOnly = requiredRoles.length === 1 && requiredRoles[0] === Role.SUPER_ADMIN;
    if (userRoles.includes(Role.ADMIN) && !superAdminOnly) return true;
    const allowed = requiredRoles.some((role) => userRoles.includes(role));
    if (!allowed) {
      const segments = request.path.split('/').filter(Boolean);
      void this.prisma.auditLog
        .create({
          data: {
            userId: request.user.id,
            action: 'ACCESS_DENIED',
            entity: segments[0] ?? 'unknown',
            ipAddress: request.ip,
            metadata: {
              path: request.path,
              method: request.method,
              role: request.user.role,
              additionalRoles: request.user.additionalRoles,
              requiredRoles,
            },
          },
        })
        .catch(() => undefined);
      const labels: Record<Role, string> = {
        SUPER_ADMIN: 'Super-administrateur',
        ADMIN: 'Administrateur',
        CASHIER: 'Caissier',
        RECEPTIONIST: 'Réceptionniste',
        SECRETARY: 'Réceptionniste (secrétariat)',
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
      };
      throw new ForbiddenException({
        code: 'ROLE_REQUIRED',
        message: `Accès refusé. Rôle(s) requis : ${requiredRoles.map((role) => labels[role]).join(', ')}. Votre compte possède : ${userRoles.map((role) => labels[role]).join(', ')}.`,
      });
    }
    return true;
  }
}
