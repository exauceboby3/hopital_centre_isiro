import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { publicUserSelect } from '../users/users.service';
import { CreateStaffDto } from './dto/create-staff.dto';

const clinicianRoles: Role[] = [Role.DOCTOR, Role.SURGEON, Role.MIDWIFE];

const staffRoles: Role[] = [
  Role.CASHIER,
  Role.RECEPTIONIST,
  Role.SECRETARY,
  Role.DOCTOR,
  Role.NURSE,
  Role.LAB_TECHNICIAN,
  Role.MEDICAL_BIOLOGIST,
  Role.RADIOLOGIST,
  Role.SURGEON,
  Role.MIDWIFE,
  Role.PHARMACIST,
  Role.ACCOUNTANT,
  Role.STOREKEEPER,
  Role.HR,
];

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({
      where: { role: { in: staffRoles } },
      select: publicUserSelect,
      orderBy: [{ isActive: 'desc' }, { username: 'asc' }],
    });
  }

  async create(dto: CreateStaffDto) {
    if (!staffRoles.includes(dto.role)) {
      throw new BadRequestException('Ce rôle ne peut pas être créé depuis le module du personnel.');
    }
    if (clinicianRoles.includes(dto.role) && !dto.specialty?.trim()) {
      throw new BadRequestException('La spécialité du praticien est obligatoire.');
    }
    const username = dto.username.trim();
    if (username.length < 3) {
      throw new BadRequestException("Le nom d'utilisateur doit contenir au moins 3 caractères.");
    }
    const usernameExists = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (usernameExists) {
      throw new ConflictException(
        "Ce nom d'utilisateur existe déjà, même avec une casse différente.",
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    try {
      const userId = await this.prisma.$transaction(async (transaction) => {
        const user = await transaction.user.create({
          data: { username, passwordHash, role: dto.role },
        });
        const common = {
          userId: user.id,
          lastName: dto.lastName.trim(),
          postName: dto.postName,
          firstName: dto.firstName,
          phone: dto.phone,
          address: dto.address,
        };

        if (clinicianRoles.includes(dto.role)) {
          await transaction.doctorProfile.create({
            data: {
              ...common,
              specialty: dto.specialty!,
              grade: dto.grade,
              licenseNumber: dto.licenseNumber,
            },
          });
        } else if (dto.role === Role.NURSE) {
          await transaction.nurseProfile.create({ data: { ...common, specialty: dto.specialty } });
        } else if (dto.role === Role.SECRETARY || dto.role === Role.RECEPTIONIST) {
          await transaction.secretaryProfile.create({
            data: { ...common, educationLevel: dto.educationLevel },
          });
        } else if (dto.role === Role.LAB_TECHNICIAN || dto.role === Role.MEDICAL_BIOLOGIST) {
          await transaction.labTechnicianProfile.create({
            data: { ...common, specialty: dto.specialty },
          });
        } else {
          await transaction.staffProfile.create({
            data: { ...common, specialty: dto.specialty, grade: dto.grade },
          });
        }
        return user.id;
      });
      return this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: publicUserSelect,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException("Le nom d'utilisateur ou le numéro professionnel existe déjà.");
      }
      throw error;
    }
  }

  async setActive(id: string, isActive: boolean) {
    const exists = await this.prisma.user.count({ where: { id, role: { in: staffRoles } } });
    if (!exists) throw new NotFoundException('Membre du personnel introuvable.');

    if (!isActive) {
      await this.prisma.authSession.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return this.prisma.user.update({ where: { id }, data: { isActive }, select: publicUserSelect });
  }
}
