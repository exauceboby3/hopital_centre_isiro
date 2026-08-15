import { decodeCodedDiagnoses } from './clinical-report';

describe('decodeCodedDiagnoses', () => {
  it('extracts official codes and labels from the structured clinical report', () => {
    expect(
      decodeCodedDiagnoses(
        'B54 — Paludisme, sans précision\nA00.0 — Choléra — À Vibrio cholerae 01, biovar cholerae',
      ),
    ).toEqual([
      { code: 'B54', label: 'Paludisme, sans précision' },
      { code: 'A00.0', label: 'Choléra — À Vibrio cholerae 01, biovar cholerae' },
    ]);
  });

  it('does not invent a code for an old free-text diagnosis', () => {
    expect(decodeCodedDiagnoses('Paludisme probable')).toEqual([]);
  });
});
