import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PatientAccessService } from './patient-access.service';

describe('PatientAccessService', () => {
  it('autorise un médecin à consulter un patient actif non affecté', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'patient-1' });
    const service = new PatientAccessService({
      patient: { findFirst },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService);

    await service.assertCanAccess('patient-1', {
      id: 'doctor-1',
      username: 'doctor',
      role: Role.DOCTOR,
      additionalRoles: [],
    });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-1', archivedAt: null },
      select: { id: true },
    });
  });

  it('conserve le périmètre clinique limité pour un infirmier', async () => {
    type PatientFindInput = { where: Record<string, unknown> };
    const findInputs: PatientFindInput[] = [];
    const findFirst = jest.fn<Promise<{ id: string }>, [PatientFindInput]>((input) => {
      findInputs.push(input);
      return Promise.resolve({ id: 'patient-1' });
    });
    const service = new PatientAccessService({
      patient: { findFirst },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as PrismaService);

    await service.assertCanAccess('patient-1', {
      id: 'nurse-1',
      username: 'nurse',
      role: Role.NURSE,
      additionalRoles: [],
    });

    const input = findInputs.at(0);
    expect(input).toBeDefined();
    expect(input?.where).toHaveProperty('OR');
  });
});
