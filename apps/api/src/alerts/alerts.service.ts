import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmergencyAlertStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmergencyAlertDto } from './dto/create-emergency-alert.dto';

const alertInclude = {
  createdBy: { select: { id: true, username: true, role: true } },
  resolvedBy: { select: { id: true, username: true, role: true } },
};

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  active(roles: Role[]) {
    const now = new Date();
    return this.prisma.emergencyAlert.findMany({
      where: {
        status: EmergencyAlertStatus.ACTIVE,
        OR: [{ targetRole: null }, { targetRole: { in: roles } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      include: alertInclude,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  history() {
    return this.prisma.emergencyAlert.findMany({
      include: alertInclude,
      orderBy: { createdAt: 'desc' },
      take: 250,
    });
  }

  create(dto: CreateEmergencyAlertDto, createdById: string) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("La date d'expiration doit être future.");
    }
    return this.prisma.emergencyAlert.create({
      data: {
        ...dto,
        title: dto.title.trim(),
        message: dto.message.trim(),
        location: dto.location?.trim(),
        expiresAt,
        createdById,
      },
      include: alertInclude,
    });
  }

  async resolve(id: string, resolvedById: string) {
    const claimed = await this.prisma.emergencyAlert.updateMany({
      where: { id, status: EmergencyAlertStatus.ACTIVE },
      data: {
        status: EmergencyAlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById,
      },
    });
    if (!claimed.count) {
      const exists = await this.prisma.emergencyAlert.count({ where: { id } });
      if (!exists) throw new NotFoundException("Alerte d'urgence introuvable.");
      throw new BadRequestException('Cette alerte est déjà résolue.');
    }
    return this.prisma.emergencyAlert.findUniqueOrThrow({
      where: { id },
      include: alertInclude,
    });
  }
}
