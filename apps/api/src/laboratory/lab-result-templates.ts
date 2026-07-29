export type LabResultFieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'LONG_TEXT';

export interface LabResultField {
  key: string;
  label: string;
  type: LabResultFieldType;
  unit?: string;
  reference?: string;
  required: boolean;
  options?: string[];
}

const field = (
  key: string,
  label: string,
  type: LabResultFieldType = 'TEXT',
  unit?: string,
  reference?: string,
  options?: string[],
  required = true,
): LabResultField => ({ key, label, type, unit, reference, options, required });

const qualitative = (label = 'Résultat') =>
  field('resultat', label, 'SELECT', undefined, undefined, ['Négatif', 'Positif', 'Indéterminé']);

const templates: Record<string, LabResultField[]> = {
  'LAB-NFS': [
    field('hemoglobine', 'Hémoglobine', 'NUMBER', 'g/dL', 'Adulte : 12–17'),
    field('hematocrite', 'Hématocrite', 'NUMBER', '%', 'Adulte : 36–52'),
    field('globules_rouges', 'Globules rouges', 'NUMBER', '10⁶/µL', '4,0–6,0'),
    field('vgm', 'VGM', 'NUMBER', 'fL', '80–100'),
    field('tcmh', 'TCMH', 'NUMBER', 'pg', '27–32'),
    field('ccmh', 'CCMH', 'NUMBER', 'g/dL', '32–36'),
    field('leucocytes', 'Leucocytes', 'NUMBER', '/µL', '4 000–10 000'),
    field('neutrophiles', 'Neutrophiles', 'NUMBER', '%', '40–75'),
    field('lymphocytes', 'Lymphocytes', 'NUMBER', '%', '20–45'),
    field('monocytes', 'Monocytes', 'NUMBER', '%', '2–10'),
    field('eosinophiles', 'Éosinophiles', 'NUMBER', '%', '0–6'),
    field('basophiles', 'Basophiles', 'NUMBER', '%', '0–2'),
    field('plaquettes', 'Plaquettes', 'NUMBER', '/µL', '150 000–450 000'),
  ],
  'LAB-ABORH': [
    field('groupe_abo', 'Groupe ABO', 'SELECT', undefined, undefined, ['A', 'B', 'AB', 'O']),
    field('rhesus', 'Rhésus', 'SELECT', undefined, undefined, ['Positif', 'Négatif']),
  ],
  'LAB-TPINR': [
    field('tp', 'Taux de prothrombine', 'NUMBER', '%', '70–100'),
    field('inr', 'INR', 'NUMBER', '', '0,8–1,2 hors anticoagulant'),
  ],
  'LAB-BILIT': [
    field('bilirubine_totale', 'Bilirubine totale', 'NUMBER', 'mg/dL', '0,2–1,2'),
    field('bilirubine_directe', 'Bilirubine directe', 'NUMBER', 'mg/dL', '≤ 0,3'),
  ],
  'LAB-MALARIA': [
    qualitative('Plasmodium recherché'),
    field('espece', 'Espèce identifiée', 'TEXT', undefined, undefined, undefined, false),
    field('densite', 'Densité parasitaire', 'NUMBER', 'parasites/µL', undefined, undefined, false),
  ],
  'LAB-URINES': [
    field('aspect', 'Aspect', 'TEXT'),
    field('couleur', 'Couleur', 'TEXT'),
    field('ph', 'pH', 'NUMBER', '', '5,0–8,0'),
    field('densite', 'Densité', 'NUMBER', '', '1,005–1,030'),
    field('proteines', 'Protéines', 'TEXT'),
    field('glucose', 'Glucose', 'TEXT'),
    field('cetones', 'Corps cétoniques', 'TEXT'),
    field('leucocytes', 'Leucocytes', 'TEXT'),
    field('hematies', 'Hématies', 'TEXT'),
    field('nitrites', 'Nitrites', 'SELECT', undefined, undefined, ['Négatif', 'Positif']),
    field(
      'sediment',
      'Sédiment / microscopie',
      'LONG_TEXT',
      undefined,
      undefined,
      undefined,
      false,
    ),
  ],
  'LAB-BU': [
    field('ph', 'pH', 'NUMBER'),
    field('densite', 'Densité', 'NUMBER'),
    field('proteines', 'Protéines', 'TEXT'),
    field('glucose', 'Glucose', 'TEXT'),
    field('cetones', 'Corps cétoniques', 'TEXT'),
    field('sang', 'Sang', 'TEXT'),
    field('leucocytes', 'Leucocytes', 'TEXT'),
    field('nitrites', 'Nitrites', 'SELECT', undefined, undefined, ['Négatif', 'Positif']),
  ],
  'LAB-SELLES': [
    field('aspect', 'Aspect macroscopique', 'TEXT'),
    field('consistance', 'Consistance', 'TEXT'),
    field('parasites', 'Parasites / œufs / kystes', 'LONG_TEXT'),
    field('leucocytes', 'Leucocytes', 'TEXT', undefined, undefined, undefined, false),
    field('hematies', 'Hématies', 'TEXT', undefined, undefined, undefined, false),
  ],
  'LAB-ECBU': [
    field('leucocytes', 'Leucocytes', 'TEXT'),
    field('hematies', 'Hématies', 'TEXT'),
    field('culture', 'Culture', 'SELECT', undefined, undefined, [
      'Stérile',
      'Positive',
      'Contaminée',
    ]),
    field('germe', 'Germe isolé', 'TEXT', undefined, undefined, undefined, false),
    field('denombrement', 'Dénombrement', 'TEXT', 'UFC/mL', undefined, undefined, false),
    field('antibiogramme', 'Antibiogramme', 'LONG_TEXT', undefined, undefined, undefined, false),
  ],
  'LAB-SPERMO': [
    field('volume', 'Volume', 'NUMBER', 'mL', '≥ 1,4'),
    field('ph', 'pH', 'NUMBER', '', '≥ 7,2'),
    field('concentration', 'Concentration', 'NUMBER', 'millions/mL', '≥ 16'),
    field('mobilite', 'Mobilité totale', 'NUMBER', '%', '≥ 42'),
    field('vitalite', 'Vitalité', 'NUMBER', '%', '≥ 54'),
    field('formes_normales', 'Formes normales', 'NUMBER', '%', '≥ 4'),
    field('observations', 'Observations', 'LONG_TEXT', undefined, undefined, undefined, false),
  ],
  'LAB-LCR': [
    field('aspect', 'Aspect', 'TEXT'),
    field('cellules', 'Cellules', 'NUMBER', '/mm³'),
    field('proteines', 'Protéines', 'NUMBER', 'g/L'),
    field('glucose', 'Glucose', 'NUMBER', 'mg/dL'),
    field('gram', 'Examen direct / Gram', 'LONG_TEXT'),
    field('culture', 'Culture', 'LONG_TEXT', undefined, undefined, undefined, false),
  ],
  'LAB-TOXO': [field('igg', 'Toxoplasmose IgG'), field('igm', 'Toxoplasmose IgM')],
  'LAB-RUB': [field('igg', 'Rubéole IgG'), field('igm', 'Rubéole IgM')],
  'LAB-CMV': [field('igg', 'CMV IgG'), field('igm', 'CMV IgM')],
};

const quantitative: Record<string, [string, string?]> = {
  'LAB-HB': ['g/dL', 'Adulte : 12–17'],
  'LAB-HTE': ['%', 'Adulte : 36–52'],
  'LAB-VS': ['mm/h'],
  'LAB-RETIC': ['%'],
  'LAB-TCA': ['secondes'],
  'LAB-FIB': ['g/L'],
  'LAB-G6PD': ['U/g Hb'],
  'LAB-GLY': ['mg/dL', 'À jeun : 70–110'],
  'LAB-HBA1C': ['%', '< 5,7 hors diabète'],
  'LAB-UREE': ['mg/dL'],
  'LAB-CREAT': ['mg/dL'],
  'LAB-URIC': ['mg/dL'],
  'LAB-AST': ['UI/L'],
  'LAB-ALT': ['UI/L'],
  'LAB-PAL': ['UI/L'],
  'LAB-GGT': ['UI/L'],
  'LAB-PROT': ['g/dL'],
  'LAB-ALB': ['g/dL'],
  'LAB-CHOL': ['mg/dL', '< 200'],
  'LAB-HDL': ['mg/dL', '> 40'],
  'LAB-LDL': ['mg/dL', '< 130'],
  'LAB-TG': ['mg/dL', '< 150'],
  'LAB-NA': ['mmol/L', '135–145'],
  'LAB-K': ['mmol/L', '3,5–5,1'],
  'LAB-CL': ['mmol/L', '98–107'],
  'LAB-CA': ['mg/dL'],
  'LAB-MG': ['mg/dL'],
  'LAB-CRP': ['mg/L', '< 6'],
  'LAB-AMYL': ['UI/L'],
  'LAB-LIPASE': ['UI/L'],
  'LAB-LDH': ['UI/L'],
  'LAB-PROTEINURIE': ['mg/24 h'],
  'LAB-GLYCOSURIE': ['mg/dL'],
  'LAB-CD4': ['cellules/µL'],
  'LAB-HIV-VL': ['copies/mL'],
  'LAB-BHCG': ['mUI/mL'],
  'LAB-TSH': ['mUI/L'],
  'LAB-FT4': ['pmol/L'],
  'LAB-PRL': ['ng/mL'],
  'LAB-FSH': ['UI/L'],
  'LAB-LH': ['UI/L'],
  'LAB-PSA': ['ng/mL'],
  'LAB-RF': ['UI/mL'],
  'LAB-ASLO': ['UI/mL'],
};

const qualitativeCodes = new Set([
  'LAB-MALARIA-TDR',
  'LAB-SELLES-SANG',
  'LAB-SCHISTO',
  'LAB-HIV',
  'LAB-HBSAG',
  'LAB-HCV',
  'LAB-SYPHILIS',
  'LAB-TPHA',
  'LAB-TB-AFB',
  'LAB-TB-XPERT',
  'LAB-COVID-AG',
  'LAB-COVID-PCR',
  'LAB-HCG-UR',
]);

export function defaultLabResultTemplate(code?: string | null, category?: string | null) {
  const normalizedCode = code?.trim().toUpperCase() ?? '';
  if (templates[normalizedCode]) return templates[normalizedCode].map((entry) => ({ ...entry }));
  if (quantitative[normalizedCode]) {
    const [unit, reference] = quantitative[normalizedCode];
    return [field('resultat', 'Résultat', 'NUMBER', unit, reference)];
  }
  if (qualitativeCodes.has(normalizedCode)) return [qualitative()];
  if (category === 'Microbiologie') {
    return [
      field('examen_direct', 'Examen direct', 'LONG_TEXT'),
      field(
        'culture',
        'Culture / identification',
        'LONG_TEXT',
        undefined,
        undefined,
        undefined,
        false,
      ),
      field('antibiogramme', 'Antibiogramme', 'LONG_TEXT', undefined, undefined, undefined, false),
    ];
  }
  if (category === 'Anatomopathologie') {
    return [
      field('macroscopie', 'Description macroscopique', 'LONG_TEXT'),
      field('microscopie', 'Description microscopique', 'LONG_TEXT'),
      field('conclusion', 'Conclusion anatomopathologique', 'LONG_TEXT'),
    ];
  }
  return [field('resultat', 'Résultat')];
}

export function normalizeLabResultTemplate(
  value: unknown,
  code?: string | null,
  category?: string | null,
): LabResultField[] {
  if (!Array.isArray(value) || !value.length) return defaultLabResultTemplate(code, category);
  const result = value
    .filter(
      (entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object',
    )
    .map((entry, index) => {
      const textValue = (value: unknown, fallback: string) =>
        typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
      const type = ['TEXT', 'NUMBER', 'SELECT', 'LONG_TEXT'].includes(String(entry.type))
        ? (String(entry.type) as LabResultFieldType)
        : 'TEXT';
      const options = Array.isArray(entry.options)
        ? entry.options
            .map(String)
            .map((option) => option.trim())
            .filter(Boolean)
            .slice(0, 30)
        : undefined;
      return {
        key: textValue(entry.key, `rubrique_${index + 1}`)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_')
          .slice(0, 60),
        label: textValue(entry.label, `Rubrique ${index + 1}`)
          .trim()
          .slice(0, 120),
        type,
        unit: textValue(entry.unit, '').trim().slice(0, 40) || undefined,
        reference: textValue(entry.reference, '').trim().slice(0, 120) || undefined,
        required: entry.required !== false,
        options: type === 'SELECT' && options?.length ? options : undefined,
      } satisfies LabResultField;
    })
    .filter((entry) => entry.key && entry.label)
    .slice(0, 60);
  return result.length ? result : defaultLabResultTemplate(code, category);
}
