import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmergencyPatientLookupService {
  constructor(private readonly prisma: PrismaService) {}

  search(search?: string) {
    const query = search?.trim();
    if (!query || query.length < 2) {
      throw new BadRequestException('Saisissez au moins deux caractères pour identifier le patient.');
    }
    return this.prisma.patient.findMany({
      where: {
        archivedAt: null,
        OR: [
          { medicalRecordNumber: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { postName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { phone: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        medicalRecordNumber: true,
        lastName: true,
        postName: true,
        firstName: true,
        sex: true,
        dateOfBirth: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 20,
    });
  }
}
