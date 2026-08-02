import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StaffService } from './staff.service';

jest.mock('argon2', () => ({ hash: jest.fn().mockResolvedValue('hash') }));

describe('StaffService', () => {
  it.each([Role.DOCTOR, Role.SURGEON, Role.MIDWIFE])(
    'crée un DoctorProfile pour le rôle clinique %s',
    async (role) => {
      const doctorCreate = jest.fn().mockResolvedValue({});
      const transaction = {
        user: { create: jest.fn().mockResolvedValue({ id: 'user-1' }) },
        doctorProfile: { create: doctorCreate },
        nurseProfile: { create: jest.fn() },
        secretaryProfile: { create: jest.fn() },
        labTechnicianProfile: { create: jest.fn() },
        staffProfile: { create: jest.fn() },
      };
      const prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', role }),
        },
        $transaction: (callback: (client: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      } as unknown as PrismaService;
      const service = new StaffService(prisma);

      await service.create({
        username: `user-${role.toLowerCase()}`,
        password: 'MotDePasse!123',
        role,
        lastName: 'TEST',
        specialty: 'Médecine générale',
      });

      expect(doctorCreate).toHaveBeenCalled();
      expect(transaction.staffProfile.create).not.toHaveBeenCalled();
    },
  );
});
