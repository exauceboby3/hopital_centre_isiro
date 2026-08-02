import { TabularCodecService } from './tabular-codec.service';
import { TabularDocument } from './data-exchange.types';

const document: TabularDocument = {
  title: 'Test des échanges',
  columns: [
    { key: 'name', label: 'Nom', kind: 'string' },
    { key: 'quantity', label: 'Quantité', kind: 'integer' },
    { key: 'active', label: 'Actif', kind: 'boolean' },
  ],
  rows: [
    { name: 'Ceftriaxone, injection', quantity: 12, active: true },
    { name: 'Gants "stériles"', quantity: 4, active: false },
  ],
  branding: { name: "Centre Hospitalier d'Isiro" },
};

describe('TabularCodecService', () => {
  const codec = new TabularCodecService();

  it('conserve les séparateurs, guillemets et accents dans un aller-retour CSV', () => {
    const encoded = codec.encodeCsv(document);
    const parsed = codec.parseCsv(encoded.toString('utf8'));

    expect(parsed.headers).toEqual(['Nom', 'Quantité', 'Actif']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({ Nom: 'Ceftriaxone, injection', Quantité: '12' });
    expect(parsed.rows[1]?.Nom).toBe('Gants "stériles"');
  });

  it('génère un classeur Excel lisible puis relit ses données', () => {
    const encoded = codec.encodeXlsx(document);
    expect(encoded.subarray(0, 2).toString()).toBe('PK');

    const parsed = codec.parseXlsx(encoded);
    expect(parsed.headers).toEqual(['Nom', 'Quantité', 'Actif']);
    expect(parsed.rows[0]).toMatchObject({ Nom: 'Ceftriaxone, injection', Quantité: '12' });
    expect(parsed.rows[1]?.Actif).toBe('Non');
  });

  it('génère un vrai document PDF', async () => {
    const encoded = await codec.encodePdf(document);
    expect(encoded.subarray(0, 4).toString()).toBe('%PDF');
    expect(encoded.length).toBeGreaterThan(800);
  });
});
