import {
  bodySystemGroups,
  bodySystemStructures,
  bodySystems,
  formatBodySystems,
  formatDiagnoses,
  parseBodySystems,
  parseDiagnoses,
  parseDiagnosisCodes,
  type Icd10CatalogRow,
} from './consultations.model';

describe('consultation clinical selectors', () => {
  it('stores body systems in the official alphabetical display order', () => {
    const selected = ['Système nerveux', 'Appareil digestif'];
    const stored = formatBodySystems(selected);

    expect(stored).toBe('Appareil digestif\nSystème nerveux');
    expect(parseBodySystems(stored)).toEqual(['Appareil digestif', 'Système nerveux']);
    expect([...bodySystems]).toEqual(
      [...bodySystems].sort((left, right) => left.localeCompare(right, 'fr')),
    );
  });

  it('ignores legacy free text when resolving selected systems', () => {
    expect(parseBodySystems('Douleur abdominale depuis deux jours')).toEqual([]);
  });

  it('details every body system with selectable anatomical structures', () => {
    expect(bodySystemGroups).toHaveLength(16);
    expect(bodySystemGroups.every((group) => group.structures.length >= 8)).toBe(true);
    expect(bodySystemStructures.length).toBeGreaterThan(150);

    const selected = [
      'Appareil digestif — Foie',
      'Système nerveux — Cerveau',
      'Système sensoriel — vision — Rétine',
    ];

    expect(parseBodySystems(formatBodySystems(selected))).toEqual(selected);
  });

  it('stores and restores official CIM-10 codes with their complete labels', () => {
    const catalog: Icd10CatalogRow[] = [
      ['A00.0', 'À Vibrio cholerae 01, biovar cholerae', 'Choléra', 'Maladies infectieuses'],
      ['B54', 'Paludisme, sans précision', '', 'Maladies infectieuses'],
    ];
    const stored = formatDiagnoses(['B54', 'A00.0'], catalog);

    expect(stored).toBe(
      'B54 — Paludisme, sans précision\nA00.0 — Choléra — À Vibrio cholerae 01, biovar cholerae',
    );
    expect(parseDiagnosisCodes(stored)).toEqual(['B54', 'A00.0']);
    expect(parseDiagnoses(stored)).toEqual([
      { code: 'B54', label: 'Paludisme, sans précision' },
      { code: 'A00.0', label: 'Choléra — À Vibrio cholerae 01, biovar cholerae' },
    ]);
  });

  it('keeps legacy diagnoses readable without treating them as coded values', () => {
    expect(parseDiagnoses('Paludisme probable')).toEqual([]);
  });
});
