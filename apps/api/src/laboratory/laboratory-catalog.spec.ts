import { laboratoryCatalog } from '../../prisma/laboratory-catalog';

describe('Catalogue initial du laboratoire', () => {
  it('contient un ensemble étendu et classé d’examens fréquents', () => {
    expect(laboratoryCatalog.length).toBeGreaterThanOrEqual(70);
    expect(new Set(laboratoryCatalog.map((exam) => exam.category)).size).toBeGreaterThanOrEqual(10);
  });

  it('utilise une référence unique pour chaque examen', () => {
    const codes = laboratoryCatalog.map((exam) => exam.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^LAB-[A-Z0-9-]+$/.test(code))).toBe(true);
  });
});
