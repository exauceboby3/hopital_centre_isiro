import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmergencyAlertStatus, EmergencySeverity, Role } from '@prisma/client';
import { AlertsService } from './alerts.service';

type FindManyInput = {
  where: {
    status: EmergencyAlertStatus;
    OR: Array<{ targetRole: null } | { targetRole: { in: Role[] } }>;
  };
};

type UpdateManyInput = {
  where: { id: string; status: EmergencyAlertStatus };
  data: { status: EmergencyAlertStatus; resolvedAt: Date; resolvedById: string };
};

function fixture() {
  const findMany = jest.fn<Promise<unknown[]>, [FindManyInput]>().mockResolvedValue([]);
  const updateMany = jest.fn<Promise<{ count: number }>, [UpdateManyInput]>();
  const prisma = {
    hospitalization: { findFirst: jest.fn() },
    emergencyAlert: {
      findMany,
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'alert-1' }),
      create: jest.fn(),
      updateMany,
      count: jest.fn(),
    },
    emergencyAlertComment: { create: jest.fn() },
  };
  return { service: new AlertsService(prisma as never), prisma };
}

describe('AlertsService séquence d’urgence', () => {
  it('retourne les alertes globales ou destinées aux rôles effectifs', async () => {
    const { service, prisma } = fixture();
    await service.active([Role.MEDICAL_BIOLOGIST, Role.LAB_TECHNICIAN]);
    const input = prisma.emergencyAlert.findMany.mock.calls[0]?.[0];
    if (!input) throw new Error("La recherche d'alertes n'a pas été exécutée.");
    expect(input.where.status).toBe(EmergencyAlertStatus.ACTIVE);
    expect(input.where.OR).toEqual([
      { targetRole: null },
      { targetRole: { in: [Role.MEDICAL_BIOLOGIST, Role.LAB_TECHNICIAN] } },
    ]);
  });

  it('refuse une hospitalisation qui ne correspond pas au patient', async () => {
    const { service, prisma } = fixture();
    prisma.hospitalization.findFirst.mockResolvedValue(null);
    await expect(
      service.create(
        {
          title: 'Patient instable',
          message: 'Évaluation médicale immédiate',
          severity: EmergencySeverity.CRITICAL,
          patientId: 'patient-1',
          hospitalizationId: 'stay-1',
        },
        'nurse-1',
      ),
    ).rejects.toThrow("L'hospitalisation active ne correspond pas au patient.");
  });

  it('normalise et enregistre un commentaire médical', async () => {
    const { service, prisma } = fixture();
    prisma.emergencyAlert.findUnique.mockResolvedValue({ id: 'alert-1' });
    prisma.emergencyAlertComment.create.mockResolvedValue({ id: 'comment-1' });

    await service.addComment('alert-1', '  Surveillance rapprochée  ', 'doctor-1');

    expect(prisma.emergencyAlertComment.create).toHaveBeenCalledWith({
      data: {
        alertId: 'alert-1',
        authorId: 'doctor-1',
        comment: 'Surveillance rapprochée',
      },
      include: { author: { select: { id: true, username: true, role: true } } },
    });
  });

  it('refuse un commentaire sur une alerte inexistante', async () => {
    const { service, prisma } = fixture();
    prisma.emergencyAlert.findUnique.mockResolvedValue(null);
    await expect(service.addComment('missing', 'Avis médical', 'doctor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('revendique atomiquement la résolution et refuse une seconde résolution', async () => {
    const { service, prisma } = fixture();
    prisma.emergencyAlert.updateMany.mockResolvedValueOnce({ count: 1 });
    await service.resolve('alert-1', 'doctor-1');
    const input = prisma.emergencyAlert.updateMany.mock.calls[0]?.[0];
    if (!input) throw new Error("La résolution de l'alerte n'a pas été exécutée.");
    expect(input.where).toEqual({ id: 'alert-1', status: EmergencyAlertStatus.ACTIVE });
    expect(input.data.status).toBe(EmergencyAlertStatus.RESOLVED);
    expect(input.data.resolvedById).toBe('doctor-1');
    expect(input.data.resolvedAt).toBeInstanceOf(Date);

    prisma.emergencyAlert.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.emergencyAlert.count.mockResolvedValue(1);
    await expect(service.resolve('alert-1', 'doctor-2')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
