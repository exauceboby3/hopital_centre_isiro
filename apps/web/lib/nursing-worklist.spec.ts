import { buildNursingPatientGroups, NursingWorklistCare } from './nursing-worklist';

const patient = (id: string, lastName: string) => ({
  id,
  medicalRecordNumber: `CHI-${id}`,
  lastName,
});

const care = (
  id: string,
  patientId: string,
  lastName: string,
  scheduledAt: string,
  status = 'SCHEDULED',
): NursingWorklistCare => ({
  id,
  patient: patient(patientId, lastName),
  status,
  label: `Soin ${id}`,
  scheduledAt,
});

describe('buildNursingPatientGroups', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');

  it('produit une seule ligne par patient malgré plusieurs administrations', () => {
    const groups = buildNursingPatientGroups(
      [
        care('1', 'P1', 'Boby', '2026-08-05T11:00:00.000Z'),
        care('2', 'P1', 'Boby', '2026-08-05T19:00:00.000Z'),
        care('3', 'P2', 'Malu', '2026-08-05T12:15:00.000Z'),
      ],
      '',
      now,
    );

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.patient.id === 'P1')?.activeRows).toHaveLength(2);
  });

  it('place les patients en retard avant les soins à venir', () => {
    const groups = buildNursingPatientGroups(
      [
        care('future', 'P2', 'Malu', '2026-08-05T15:00:00.000Z'),
        care('late', 'P1', 'Boby', '2026-08-05T11:00:00.000Z'),
      ],
      '',
      now,
    );

    expect(groups[0]?.patient.id).toBe('P1');
    expect(groups[0]?.overdueCount).toBe(1);
  });

  it('retire un patient lorsque tous ses soins sont terminés ou annulés', () => {
    const groups = buildNursingPatientGroups(
      [
        care('done', 'P1', 'Boby', '2026-08-05T10:00:00.000Z', 'COMPLETED'),
        care('cancelled', 'P1', 'Boby', '2026-08-05T11:00:00.000Z', 'CANCELLED'),
      ],
      '',
      now,
    );

    expect(groups).toEqual([]);
  });

  it('recherche par patient, dossier ou soin sans recréer plusieurs lignes', () => {
    const rows = [
      { ...care('1', 'P1', 'Boby', '2026-08-05T11:00:00.000Z'), medicationName: 'Quinine' },
      care('2', 'P2', 'Malu', '2026-08-05T13:00:00.000Z'),
    ];

    expect(
      buildNursingPatientGroups(rows, 'quinine', now).map((group) => group.patient.id),
    ).toEqual(['P1']);
  });
});
