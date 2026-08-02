import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomFieldEntity, Prisma, Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuthenticatedUser } from '../common/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

export const publicUserSelect = {
  id: true,
  username: true,
  role: true,
  additionalRoles: true,
  isActive: true,
  lastActiveAt: true,
  createdAt: true,
  doctorProfile: true,
  nurseProfile: true,
  secretaryProfile: true,
  labProfile: true,
  staffProfile: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { username: { equals: username.trim(), mode: 'insensitive' } },
    });
  }

  async findPublicById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }
    return user;
  }

  touchActive(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { lastActiveAt: new Date() },
      select: { id: true },
    });
  }

  listActive(currentUser: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        id: { not: currentUser.id },
        ...(currentUser.role === Role.SUPER_ADMIN ? {} : { role: { not: Role.SUPER_ADMIN } }),
      },
      select: publicUserSelect,
      orderBy: { username: 'asc' },
    });
  }

  async findOwnProfile(userId: string) {
    await this.ensureAdministratorDoctorProfile(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    const profile =
      user.doctorProfile ??
      user.nurseProfile ??
      user.secretaryProfile ??
      user.labProfile ??
      user.staffProfile;
    const customFields = await this.prisma.customFieldValue.findMany({
      where: { entityId: userId, definition: { entity: CustomFieldEntity.STAFF, isActive: true } },
      include: { definition: true },
      orderBy: { definition: { displayOrder: 'asc' } },
    });
    return {
      user,
      profile,
      profileType: user.doctorProfile
        ? 'DOCTOR'
        : user.nurseProfile
          ? 'NURSE'
          : user.secretaryProfile
            ? 'SECRETARY'
            : user.labProfile
              ? 'LABORATORY'
              : 'STAFF',
      customFields: customFields.map((row) => ({ definition: row.definition, value: row.value })),
    };
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    await this.ensureAdministratorDoctorProfile(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        doctorProfile: true,
        nurseProfile: true,
        secretaryProfile: true,
        labProfile: true,
        staffProfile: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const requiredLastName = dto.lastName?.trim();
    if (!requiredLastName || requiredLastName.length < 2) {
      throw new BadRequestException('Le nom doit contenir au moins 2 caractères.');
    }
    const optional = (value?: string) => {
      const normalized = value?.trim();
      return normalized ? normalized : null;
    };
    const common = {
      lastName: requiredLastName,
      postName: optional(dto.postName),
      firstName: optional(dto.firstName),
      phone: optional(dto.phone),
      address: optional(dto.address),
    };

    try {
      await this.prisma.$transaction(async (transaction) => {
        if (user.doctorProfile) {
          const specialty = optional(dto.specialty) ?? user.doctorProfile.specialty;
          await transaction.doctorProfile.update({
            where: { userId },
            data: {
              ...common,
              specialty,
              grade: optional(dto.grade),
              licenseNumber: optional(dto.licenseNumber)?.toUpperCase() ?? null,
            },
          });
        } else if (user.nurseProfile) {
          await transaction.nurseProfile.update({
            where: { userId },
            data: { ...common, specialty: optional(dto.specialty) },
          });
        } else if (user.secretaryProfile) {
          await transaction.secretaryProfile.update({
            where: { userId },
            data: { ...common, educationLevel: optional(dto.educationLevel) },
          });
        } else if (user.labProfile) {
          await transaction.labTechnicianProfile.update({
            where: { userId },
            data: { ...common, specialty: optional(dto.specialty) },
          });
        } else if (user.staffProfile) {
          await transaction.staffProfile.update({
            where: { userId },
            data: { ...common, specialty: optional(dto.specialty), grade: optional(dto.grade) },
          });
        } else {
          await transaction.staffProfile.create({
            data: {
              userId,
              ...common,
              specialty: optional(dto.specialty),
              grade: optional(dto.grade),
            },
          });
        }
        await transaction.auditLog.create({
          data: {
            userId,
            action: 'OWN_PROFILE_UPDATED',
            entity: 'User',
            entityId: userId,
            metadata: {
              profileType: user.doctorProfile
                ? 'DOCTOR'
                : user.nurseProfile
                  ? 'NURSE'
                  : user.secretaryProfile
                    ? 'SECRETARY'
                    : user.labProfile
                      ? 'LABORATORY'
                      : 'STAFF',
            },
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : '';
        if (target.includes('licenseNumber')) {
          throw new BadRequestException('Ce numéro professionnel est déjà utilisé par un autre compte.');
        }
        throw new BadRequestException('Une information unique du profil est déjà utilisée.');
      }
      throw error;
    }
    return this.findOwnProfile(userId);
  }

  async changeOwnPassword(userId: string, dto: ChangeOwnPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect.');
    }
    if (await argon2.verify(user.passwordHash, dto.newPassword)) {
      throw new BadRequestException(
        'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      );
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { passwordHash },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return {
      message: 'Mot de passe modifié. Toutes les sessions ont été déconnectées par sécurité.',
    };
  }

  private async ensureAdministratorDoctorProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, additionalRoles: true, doctorProfile: true },
    });
    if (!user || user.role !== Role.ADMIN) return;
    await this.prisma.$transaction(async (transaction) => {
      if (!user.additionalRoles.includes(Role.DOCTOR)) {
        await transaction.user.update({
          where: { id: userId },
          data: { additionalRoles: { push: Role.DOCTOR } },
        });
      }
      if (!user.doctorProfile) {
        await transaction.doctorProfile.create({
          data: { userId, lastName: user.username, specialty: 'Médecine générale' },
        });
      }
    });
  }
}
