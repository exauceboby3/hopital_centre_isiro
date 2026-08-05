import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmergencyAlertStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmergencyAlertDto } from './dto/create-emergency-alert.dto';

const alertInclude = {
  createdBy: { select: { id: true, username: true, role: true } },
  resolvedBy: { select: { id: true, username: true, role: true } },
  patient: {
    select: {
      id: true,
      medicalRecordNumber: true,
      lastName: true,
      postName: true,
      firstName: true,
    },
  },
  hospitalization: { include: { bed: { include: { room: true } } } },
  comments: {
    include: { author: { select: { id: true, username: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
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

  async create(dto: CreateEmergencyAlertDto, createdById: string) {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : undefined;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("La date d'expiration doit être future.");
    }
    if (dto.hospitalizationId && !dto.patientId) {
      throw new BadRequestException(
        "Le patient est obligatoire lorsqu'une hospitalisation est associée à l'alerte.",
      );
    }
    if (dto.hospitalizationId) {
      const stay = await this.prisma.hospitalization.findFirst({
        where: { id: dto.hospitalizationId, patientId: dto.patientId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!stay)
        throw new BadRequestException("L'hospitalisation active ne correspond pas au patient.");
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

  patientAlerts(patientId: string) {
    return this.prisma.emergencyAlert.findMany({
      where: { patientId },
      include: alertInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async patientIdForAlert(id: string) {
    const alert = await this.prisma.emergencyAlert.findUnique({
      where: { id },
      select: { patientId: true },
    });
    if (!alert) throw new NotFoundException("Alerte d'urgence introuvable.");
    return alert.patientId;
  }

  async addComment(id: string, comment: string, authorId: string) {
    const normalizedComment = comment.trim();
    if (normalizedComment.length < 2) {
      throw new BadRequestException('Le commentaire doit contenir au moins 2 caractères.');
    }
    const alert = await this.prisma.emergencyAlert.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!alert) throw new NotFoundException("Alerte d'urgence introuvable.");
    return this.prisma.emergencyAlertComment.create({
      data: { alertId: id, authorId, comment: normalizedComment },
      include: { author: { select: { id: true, username: true, role: true } } },
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
