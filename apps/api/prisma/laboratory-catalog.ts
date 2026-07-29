export type LaboratoryPriceTier = 'ROUTINE' | 'SPECIALIZED';

export interface LaboratoryCatalogEntry {
  code: string;
  name: string;
  category: string;
  priceTier?: LaboratoryPriceTier;
}

export const laboratoryCatalog: LaboratoryCatalogEntry[] = [
  // Hématologie et coagulation
  { code: 'LAB-NFS', name: 'Numération formule sanguine (NFS)', category: 'Hématologie' },
  { code: 'LAB-HB', name: 'Dosage de l’hémoglobine', category: 'Hématologie' },
  { code: 'LAB-HTE', name: 'Hématocrite', category: 'Hématologie' },
  { code: 'LAB-VS', name: 'Vitesse de sédimentation (VS)', category: 'Hématologie' },
  { code: 'LAB-RETIC', name: 'Numération des réticulocytes', category: 'Hématologie' },
  { code: 'LAB-ABORH', name: 'Groupage sanguin ABO et Rhésus', category: 'Hématologie' },
  { code: 'LAB-TPINR', name: 'Taux de prothrombine et INR', category: 'Coagulation' },
  { code: 'LAB-TCA', name: 'Temps de céphaline activée (TCA)', category: 'Coagulation' },
  { code: 'LAB-FIB', name: 'Fibrinogène', category: 'Coagulation', priceTier: 'SPECIALIZED' },
  {
    code: 'LAB-HBELEC',
    name: 'Électrophorèse de l’hémoglobine / dépistage drépanocytose',
    category: 'Hématologie',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-G6PD', name: 'Dosage G6PD', category: 'Hématologie', priceTier: 'SPECIALIZED' },

  // Biochimie courante
  { code: 'LAB-GLY', name: 'Glycémie', category: 'Biochimie' },
  {
    code: 'LAB-HBA1C',
    name: 'Hémoglobine glyquée (HbA1c)',
    category: 'Biochimie',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-UREE', name: 'Urée sanguine', category: 'Biochimie' },
  { code: 'LAB-CREAT', name: 'Créatinine sanguine', category: 'Biochimie' },
  { code: 'LAB-URIC', name: 'Acide urique', category: 'Biochimie' },
  { code: 'LAB-AST', name: 'Transaminase ASAT (AST)', category: 'Biochimie' },
  { code: 'LAB-ALT', name: 'Transaminase ALAT (ALT)', category: 'Biochimie' },
  { code: 'LAB-BILIT', name: 'Bilirubine totale et directe', category: 'Biochimie' },
  { code: 'LAB-PAL', name: 'Phosphatases alcalines', category: 'Biochimie' },
  { code: 'LAB-GGT', name: 'Gamma-GT', category: 'Biochimie' },
  { code: 'LAB-PROT', name: 'Protéines totales', category: 'Biochimie' },
  { code: 'LAB-ALB', name: 'Albumine', category: 'Biochimie' },
  { code: 'LAB-CHOL', name: 'Cholestérol total', category: 'Biochimie' },
  { code: 'LAB-HDL', name: 'Cholestérol HDL', category: 'Biochimie' },
  { code: 'LAB-LDL', name: 'Cholestérol LDL', category: 'Biochimie' },
  { code: 'LAB-TG', name: 'Triglycérides', category: 'Biochimie' },
  { code: 'LAB-NA', name: 'Sodium (Na+)', category: 'Électrolytes' },
  { code: 'LAB-K', name: 'Potassium (K+)', category: 'Électrolytes' },
  { code: 'LAB-CL', name: 'Chlore (Cl-)', category: 'Électrolytes' },
  { code: 'LAB-CA', name: 'Calcium', category: 'Électrolytes' },
  { code: 'LAB-MG', name: 'Magnésium', category: 'Électrolytes' },
  { code: 'LAB-CRP', name: 'Protéine C-réactive (CRP)', category: 'Biochimie' },
  { code: 'LAB-AMYL', name: 'Amylase', category: 'Biochimie', priceTier: 'SPECIALIZED' },
  { code: 'LAB-LIPASE', name: 'Lipase', category: 'Biochimie', priceTier: 'SPECIALIZED' },
  {
    code: 'LAB-LDH',
    name: 'Lactate déshydrogénase (LDH)',
    category: 'Biochimie',
    priceTier: 'SPECIALIZED',
  },

  // Parasitologie, selles et urines
  { code: 'LAB-MALARIA', name: 'Paludisme — goutte épaisse et frottis', category: 'Parasitologie' },
  {
    code: 'LAB-MALARIA-TDR',
    name: 'Paludisme — test de diagnostic rapide',
    category: 'Parasitologie',
  },
  { code: 'LAB-SELLES', name: 'Examen parasitologique des selles', category: 'Parasitologie' },
  {
    code: 'LAB-SELLES-SANG',
    name: 'Recherche de sang occulte dans les selles',
    category: 'Selles',
  },
  { code: 'LAB-URINES', name: 'Analyse complète des urines', category: 'Urines' },
  { code: 'LAB-BU', name: 'Bandelette urinaire', category: 'Urines' },
  { code: 'LAB-SEDUR', name: 'Sédiment urinaire / microscopie', category: 'Urines' },
  { code: 'LAB-PROTEINURIE', name: 'Protéinurie', category: 'Urines' },
  { code: 'LAB-GLYCOSURIE', name: 'Glycosurie', category: 'Urines' },
  { code: 'LAB-SCHISTO', name: 'Recherche de schistosomiase urinaire', category: 'Parasitologie' },

  // Infectiologie et sérologie
  { code: 'LAB-HIV', name: 'Dépistage du VIH selon algorithme national', category: 'Sérologie' },
  {
    code: 'LAB-CD4',
    name: 'Numération des lymphocytes CD4',
    category: 'VIH',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-HIV-VL', name: 'Charge virale VIH', category: 'VIH', priceTier: 'SPECIALIZED' },
  { code: 'LAB-HBSAG', name: 'Antigène HBs — hépatite B', category: 'Sérologie' },
  { code: 'LAB-HCV', name: 'Anticorps anti-VHC — hépatite C', category: 'Sérologie' },
  { code: 'LAB-SYPHILIS', name: 'Syphilis — RPR/VDRL', category: 'Sérologie' },
  { code: 'LAB-TPHA', name: 'Syphilis — TPHA', category: 'Sérologie' },
  {
    code: 'LAB-TB-AFB',
    name: 'Tuberculose — bacilloscopie des crachats (BAAR)',
    category: 'Tuberculose',
  },
  {
    code: 'LAB-TB-XPERT',
    name: 'Tuberculose — test moléculaire GeneXpert',
    category: 'Tuberculose',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-TYPHO-CULT',
    name: 'Fièvre typhoïde — hémoculture',
    category: 'Microbiologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-WIDAL',
    name: 'Sérologie typhoïde (Widal) — selon protocole médical',
    category: 'Sérologie',
  },
  {
    code: 'LAB-TOXO',
    name: 'Sérologie toxoplasmose IgG/IgM',
    category: 'Sérologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-RUB',
    name: 'Sérologie rubéole IgG/IgM',
    category: 'Sérologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-CMV',
    name: 'Sérologie CMV IgG/IgM',
    category: 'Sérologie',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-COVID-AG', name: 'SARS-CoV-2 — test antigénique', category: 'Infectiologie' },
  {
    code: 'LAB-COVID-PCR',
    name: 'SARS-CoV-2 — PCR',
    category: 'Infectiologie',
    priceTier: 'SPECIALIZED',
  },

  // Microbiologie
  {
    code: 'LAB-ECBU',
    name: 'Examen cytobactériologique des urines (ECBU)',
    category: 'Microbiologie',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-HEMOC', name: 'Hémoculture', category: 'Microbiologie', priceTier: 'SPECIALIZED' },
  { code: 'LAB-COPROC', name: 'Coproculture', category: 'Microbiologie', priceTier: 'SPECIALIZED' },
  {
    code: 'LAB-PUS-CULT',
    name: 'Culture de pus / prélèvement de plaie',
    category: 'Microbiologie',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-GRAM', name: 'Coloration de Gram', category: 'Microbiologie' },
  { code: 'LAB-ATB', name: 'Antibiogramme', category: 'Microbiologie', priceTier: 'SPECIALIZED' },
  { code: 'LAB-PV', name: 'Prélèvement vaginal et examen direct', category: 'Microbiologie' },
  { code: 'LAB-PU', name: 'Prélèvement urétral et examen direct', category: 'Microbiologie' },
  {
    code: 'LAB-LCR',
    name: 'Analyse du liquide céphalorachidien',
    category: 'Microbiologie',
    priceTier: 'SPECIALIZED',
  },

  // Grossesse, hormones et fertilité
  { code: 'LAB-HCG-UR', name: 'Test de grossesse urinaire', category: 'Grossesse' },
  {
    code: 'LAB-BHCG',
    name: 'β-hCG sanguin quantitatif',
    category: 'Grossesse',
    priceTier: 'SPECIALIZED',
  },
  { code: 'LAB-TSH', name: 'TSH', category: 'Hormones', priceTier: 'SPECIALIZED' },
  { code: 'LAB-FT4', name: 'T4 libre (FT4)', category: 'Hormones', priceTier: 'SPECIALIZED' },
  { code: 'LAB-PRL', name: 'Prolactine', category: 'Hormones', priceTier: 'SPECIALIZED' },
  { code: 'LAB-FSH', name: 'FSH', category: 'Hormones', priceTier: 'SPECIALIZED' },
  { code: 'LAB-LH', name: 'LH', category: 'Hormones', priceTier: 'SPECIALIZED' },
  { code: 'LAB-PSA', name: 'PSA total', category: 'Marqueurs', priceTier: 'SPECIALIZED' },
  { code: 'LAB-SPERMO', name: 'Spermogramme', category: 'Fertilité', priceTier: 'SPECIALIZED' },

  // Immunologie et anatomopathologie
  { code: 'LAB-RF', name: 'Facteur rhumatoïde', category: 'Immunologie', priceTier: 'SPECIALIZED' },
  {
    code: 'LAB-ASLO',
    name: 'Antistreptolysine O (ASLO)',
    category: 'Immunologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-ANA',
    name: 'Anticorps antinucléaires (ANA)',
    category: 'Immunologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-BIOPSIE',
    name: 'Examen anatomopathologique d’une biopsie',
    category: 'Anatomopathologie',
    priceTier: 'SPECIALIZED',
  },
  {
    code: 'LAB-FROTTIS-COL',
    name: 'Frottis cervico-utérin',
    category: 'Anatomopathologie',
    priceTier: 'SPECIALIZED',
  },
];
