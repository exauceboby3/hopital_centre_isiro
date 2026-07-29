import { defaultLabResultTemplate, normalizeLabResultTemplate } from './lab-result-templates';

describe('laboratory result templates', () => {
  it('provides a complete NFS table', () => {
    const template = defaultLabResultTemplate('LAB-NFS', 'Hématologie');
    expect(template.length).toBeGreaterThanOrEqual(10);
    expect(template.map((entry) => entry.key)).toContain('hemoglobine');
    expect(template.map((entry) => entry.key)).toContain('plaquettes');
  });

  it('provides a quantitative result with unit', () => {
    expect(defaultLabResultTemplate('LAB-HDL', 'Biochimie')).toEqual([
      expect.objectContaining({ key: 'resultat', type: 'NUMBER', unit: 'mg/dL' }),
    ]);
  });

  it('sanitizes custom field keys', () => {
    expect(normalizeLabResultTemplate([{ key: 'Valeur Hb', label: 'Hb', type: 'NUMBER' }])).toEqual(
      [expect.objectContaining({ key: 'valeur_hb', label: 'Hb' })],
    );
  });
});
