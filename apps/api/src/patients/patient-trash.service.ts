import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PatientTrashService {
  constructor(private readonly prisma: PrismaService) {}

  async isInTrash(id: string): Promise<boolean> {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
      select: { archivedAt: true },
    });
    if (!patient) throw new NotFoundException('Patient introuvable.');
    return Boolean(patient.archivedAt);
  }

  async moveToTrash(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const patient = await transaction.patient.findUnique({
        where: { id },
        select: {
          id: true,
          medicalRecordNumber: true,
          lastName: true,
          postName: true,
          firstName: true,
          archivedAt: true,
        },
      });
      if (!patient) throw new NotFoundException('Patient introuvable.');
      if (patient.archivedAt) {
        throw new BadRequestException('Ce patient se trouve déjà dans la corbeille.');
      }

      const archivedAt = new Date();
      const retentionUntil = new Date(archivedAt);
      retentionUntil.setUTCFullYear(retentionUntil.getUTCFullYear() + 10);
      const reference = `COR-${archivedAt.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const reason = 'Patient déplacé dans la corbeille depuis la liste active.';

      const updated = await transaction.patient.update({
        where: { id },
        data: {
          archivedAt,
          archiveDepartment: 'GENERAL',
          archiveReason: reason,
          retentionUntil,
          archivedById: userId,
          archiveEvents: {
            create: {
              reference,
              action: ArchiveAction.ARCHIVED,
              department: 'GENERAL',
              reason,
              actorId: userId,
              metadata: { source: 'PATIENT_TRASH', restorable: true },
            },
          },
        },
        omit: { identityKey: true },
      });

      return {
        success: true,
        patient: updated,
        trashReference: reference,
        message: `Le dossier ${patient.medicalRecordNumber} a été placé dans la corbeille.`,
      };
    });
  }
}
