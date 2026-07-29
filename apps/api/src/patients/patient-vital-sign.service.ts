import { Injectable, NotFoundException } from '@nestjs/common';
import { encodeVitalSignMetadata, presentVitalSign } from '../common/vital-sign-metadata';
import { CreateVitalSignDto } from '../consultations/dto/create-vital-sign.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientVitalSignService {
  constructor(private readonly prisma: PrismaService) {}

  async create(patientId: string, dto: CreateVitalSignDto, recordedById: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, archivedAt: null },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');

    const { respiratoryRate, bloodGlucoseMgDl, notes, ...vitals } = dto;
    const row = await this.prisma.vitalSign.create({
      data: {
        ...vitals,
        notes: encodeVitalSignMetadata({
          respiratoryRate,
          bloodGlucoseMgDl,
          clinicalNotes: notes,
        }),
        patientId,
        recordedById,
      },
    });

    return presentVitalSign(row);
  }
}
