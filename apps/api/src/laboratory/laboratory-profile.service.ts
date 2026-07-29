import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaboratoryProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        labProfile: true,
        doctorProfile: true,
        nurseProfile: true,
        secretaryProfile: true,
        staffProfile: true,
      },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');

    const roles = new Set<Role>([user.role, ...user.additionalRoles]);
    if (!roles.has(Role.LAB_TECHNICIAN) && !roles.has(Role.MEDICAL_BIOLOGIST)) {
      throw new ForbiddenException('Un rôle de laboratoire est requis pour cette action.');
    }
    if (user.labProfile) return user.labProfile;

    const lastName =
      user.doctorProfile?.lastName ??
      user.nurseProfile?.lastName ??
      user.secretaryProfile?.lastName ??
      user.staffProfile?.lastName ??
      user.username;
    const postName =
      user.doctorProfile?.postName ??
      user.nurseProfile?.postName ??
      user.secretaryProfile?.postName ??
      user.staffProfile?.postName;
    const firstName =
      user.doctorProfile?.firstName ??
      user.nurseProfile?.firstName ??
      user.secretaryProfile?.firstName ??
      user.staffProfile?.firstName;
    const phone =
      user.doctorProfile?.phone ??
      user.nurseProfile?.phone ??
      user.secretaryProfile?.phone ??
      user.staffProfile?.phone;
    const address =
      user.doctorProfile?.address ??
      user.nurseProfile?.address ??
      user.secretaryProfile?.address ??
      user.staffProfile?.address;
    const specialty =
      user.doctorProfile?.specialty ??
      user.nurseProfile?.specialty ??
      user.staffProfile?.specialty;
    const biological = roles.has(Role.MEDICAL_BIOLOGIST);

    try {
      return await this.prisma.labTechnicianProfile.create({
        data: {
          userId: user.id,
          lastName: lastName.trim() || user.username,
          postName: postName?.trim() || undefined,
          firstName: firstName?.trim() || undefined,
          specialty:
            specialty?.trim() ||
            (biological ? 'Biologie médicale' : 'Technique de laboratoire'),
          phone: phone?.trim() || undefined,
          address: address?.trim() || undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.labTechnicianProfile.findUnique({ where: { userId } });
        if (existing) return existing;
      }
      throw error;
    }
  }
}
