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
    const common = {
      lastName: dto.lastName?.trim(),
      postName: dto.postName?.trim(),
      firstName: dto.firstName?.trim(),
      phone: dto.phone?.trim(),
      address: dto.address?.trim(),
    };
    if (user.doctorProfile) {
      await this.prisma.doctorProfile.update({
        where: { userId },
        data: {
          ...common,
          specialty: dto.specialty?.trim(),
          grade: dto.grade?.trim(),
          licenseNumber: dto.licenseNumber?.trim().toUpperCase(),
        },
      });
    } else if (user.nurseProfile) {
      await this.prisma.nurseProfile.update({
        where: { userId },
        data: { ...common, specialty: dto.specialty?.trim() },
      });
    } else if (user.secretaryProfile) {
      await this.prisma.secretaryProfile.update({
        where: { userId },
        data: { ...common, educationLevel: dto.educationLevel?.trim() },
      });
    } else if (user.labProfile) {
      await this.prisma.labTechnicianProfile.update({
        where: { userId },
        data: { ...common, specialty: dto.specialty?.trim() },
      });
    } else if (user.staffProfile) {
      await this.prisma.staffProfile.update({
        where: { userId },
        data: { ...common, specialty: dto.specialty?.trim(), grade: dto.grade?.trim() },
      });
    } else {
      await this.prisma.staffProfile.create({
        data: {
          userId,
          lastName: dto.lastName?.trim() || user.username,
          postName: dto.postName?.trim(),
          firstName: dto.firstName?.trim(),
          specialty: dto.specialty?.trim(),
          grade: dto.grade?.trim(),
          phone: dto.phone?.trim(),
          address: dto.address?.trim(),
        },
      });
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
