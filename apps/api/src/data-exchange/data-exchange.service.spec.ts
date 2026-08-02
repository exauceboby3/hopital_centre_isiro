import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/authenticated-user';
import { PatientsService } from '../patients/patients.service';
import { PrismaService } from '../prisma/prisma.service';
import { DataExchangeService } from './data-exchange.service';
import { TabularCodecService } from './tabular-codec.service';

const receptionist: AuthenticatedUser = {
  id: 'reception-1',
  username: 'reception',
  role: Role.RECEPTIONIST,
  additionalRoles: [],
};

function service(prisma: object = {}) {
  return new DataExchangeService(
    prisma as PrismaService,
    { create: jest.fn() } as unknown as PatientsService,
    new TabularCodecService(),
  );
}

describe('DataExchangeService', () => {
  it('présente les modules autorisés et masque le personnel à la réception', () => {
    const catalog = service().catalog(receptionist);
    expect(catalog.some((item) => item.key === 'patients' && item.canImport)).toBe(true);
    expect(catalog.some((item) => item.key === 'staff')).toBe(false);
    expect(catalog.some((item) => item.key === 'invoices' && item.canExport)).toBe(true);
  });

  it('valide un fichier patient avant toute écriture', async () => {
    const exchange = service();
    const preview = await exchange.preview(
      'patients',
      {
        originalname: 'patients.csv',
        mimetype: 'text/csv',
        size: 120,
        buffer: Buffer.from('Nom;Prénom;Sexe;Date de naissance\nMALU;Jean;Homme;1990-05-14\n'),
      },
      receptionist,
    );

    expect(preview).toMatchObject({ totalRows: 1, validRows: 1, invalidRows: 0, canCommit: true });
    expect(preview.rows[0]?.values).toMatchObject({
      lastName: 'MALU',
      firstName: 'Jean',
      sex: 'MALE',
      dateOfBirth: '1990-05-14',
    });
  });

  it('signale précisément une valeur invalide', async () => {
    const exchange = service();
    const preview = await exchange.preview(
      'patients',
      {
        originalname: 'patients.csv',
        mimetype: 'text/csv',
        size: 80,
        buffer: Buffer.from('Nom;Sexe\nMALU;Inconnu\n'),
      },
      receptionist,
    );

    expect(preview.canCommit).toBe(false);
    expect(preview.rows[0]?.errors.join(' ')).toContain('Sexe doit être');
  });

  it('interdit à un médecin d’importer le stock de la pharmacie', async () => {
    const doctor: AuthenticatedUser = {
      id: 'doctor-1',
      username: 'doctor',
      role: Role.DOCTOR,
      additionalRoles: [],
    };
    await expect(
      service().preview(
        'medications',
        {
          originalname: 'stock.csv',
          mimetype: 'text/csv',
          size: 20,
          buffer: Buffer.from('Code;Désignation;Stock;Stock minimum;Prix unitaire;Actif\nM1;Test;1;1;1;Oui\n'),
        },
        doctor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
