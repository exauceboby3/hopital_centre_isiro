import { currency, matchesSearch, patientName } from './display';

describe('display helpers', () => {
  it('assemble le nom complet sans afficher les valeurs absentes', () => {
    expect(patientName({ lastName: 'Mbuyi', postName: 'Kanku', firstName: 'Aline' })).toBe(
      'Mbuyi Kanku Aline',
    );
    expect(patientName({ lastName: 'Mbuyi', firstName: null })).toBe('Mbuyi');
  });

  it('formate les montants en francs congolais', () => {
    expect(currency(12500).replaceAll(/\s/g, ' ')).toBe('12 500 CDF');
  });

  it('recherche sans tenir compte des accents, espaces et majuscules', () => {
    expect(matchesSearch('  exauce KABUYA ', 'Exaucé', 'Kabuya', 'CHI-2026-000001')).toBe(true);
    expect(matchesSearch('000001', 'Exaucé Kabuya', 'CHI-2026-000001')).toBe(true);
    expect(matchesSearch('autre', 'Exaucé Kabuya')).toBe(false);
  });
});
