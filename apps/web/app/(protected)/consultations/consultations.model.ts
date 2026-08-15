import type { ConsultationPrescription } from '@/components/consultation-structured-prescription';
import type { Patient } from '@/lib/types';

export type ConsultationDecision =
  | 'CONTINUE'
  | 'LABORATORY'
  | 'IMAGING'
  | 'HOSPITALIZATION'
  | 'TRANSFER'
  | 'PRESCRIPTION'
  | 'FOLLOW_UP'
  | 'DISCHARGE'
  | 'COMPLETE';

export type ConsultationFormMode =
  | 'INITIAL_ASSESSMENT'
  | 'LABORATORY_VIEW'
  | 'POST_LABORATORY'
  | 'HOSPITALIZATION_VIEW'
  | 'READ_ONLY';

export interface ClinicalReport {
  chiefComplaint?: string;
  presentIllnessHistory?: string;
  anamnesisComplements?: string;
  medicalHistory?: string;
  physicalExamination?: string;
  paraclinicalExams?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  decision?: ConsultationDecision;
  preLaboratoryLockedAt?: string;
  laboratoryInterpretation?: string;
  postLaboratoryDiagnosis?: string;
  postLaboratoryPlan?: string;
  postLaboratoryNotes?: string;
  amendmentReason?: string;
}

export interface MedicalSignature {
  doctorName: string;
  licenseNumber?: string;
  signedAt: string;
  hash: string;
}

export interface ResultField {
  key: string;
  label: string;
  unit?: string;
  reference?: string;
}

export interface ResultValue {
  key: string;
  value: string;
  note?: string;
}

export interface ConsultationExam {
  id: string;
  type: string;
  status: string;
  result?: string;
  requestedAt?: string;
  validatedAt?: string;
  resultSchema?: ResultField[];
  resultData?: { values?: ResultValue[]; conclusion?: string };
  careAuthorization?: {
    status: string;
    paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
  };
}

export interface Consultation {
  id: string;
  status: string;
  reason: string;
  orientation?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  patient: Patient;
  doctor: {
    id: string;
    lastName: string;
    postName?: string;
    firstName?: string;
    specialty: string;
  };
  appointment?: { id: string; journeyStage: string; status: string };
  clinicalReport: ClinicalReport;
  signature?: MedicalSignature | null;
  prescriptions: ConsultationPrescription[];
  vitalSigns: Array<{
    id: string;
    recordedAt: string;
    temperatureC?: string;
    weightKg?: string;
    systolic?: number;
    diastolic?: number;
    pulse?: number;
    respiratoryRate?: number;
    oxygenPercent?: number;
    bloodGlucoseMgDl?: number;
  }>;
  examRequests: ConsultationExam[];
}

export interface WaitingAppointment {
  id: string;
  scheduledAt: string;
  journeyStage: string;
  patient: Patient;
  consultation?: { id: string; status: string };
  doctor?: { lastName: string; postName?: string; firstName?: string };
}

export interface BillableService {
  id: string;
  code: string;
  name: string;
  category?: string;
  price?: string;
}

export interface DoctorAvailability {
  id: string;
  name: string;
  specialty: string;
  availability: string;
}

export type Icd10CatalogRow = [code: string, label: string, parentLabel: string, chapter: string];

export interface Icd10Catalog {
  classification: string;
  version: string;
  publication: string;
  source: string;
  license: string;
  rows: Icd10CatalogRow[];
}

export const bodySystemGroups = [
  {
    label: 'Appareil cardiovasculaire',
    structures: [
      'Artères',
      'Artérioles',
      'Capillaires',
      'Circulation coronaire',
      'Circulation périphérique',
      'Cœur',
      'Endocarde',
      'Microcirculation',
      'Myocarde',
      'Péricarde',
      'Valves cardiaques',
      'Veines',
      'Veinules',
    ],
  },
  {
    label: 'Appareil digestif',
    structures: [
      'Anus',
      'Appendice',
      'Canaux biliaires',
      'Côlon',
      'Duodénum',
      'Estomac',
      'Foie',
      'Gros intestin',
      'Iléon',
      'Jéjunum',
      'Œsophage',
      'Pancréas exocrine',
      'Péritoine',
      'Pharynx digestif',
      'Rectum',
      'Vésicule biliaire',
    ],
  },
  {
    label: 'Appareil génital féminin',
    structures: [
      'Col de l’utérus',
      'Endomètre',
      'Glandes de Bartholin',
      'Ovaires',
      'Périnée féminin',
      'Seins et glandes mammaires',
      'Trompes utérines',
      'Utérus',
      'Vagin',
      'Vulve',
    ],
  },
  {
    label: 'Appareil génital masculin',
    structures: [
      'Canaux déférents',
      'Épididymes',
      'Pénis',
      'Périnée masculin',
      'Prostate',
      'Scrotum',
      'Testicules',
      'Urètre masculin',
      'Vésicules séminales',
    ],
  },
  {
    label: 'Appareil musculosquelettique',
    structures: [
      'Articulations',
      'Bourses séreuses',
      'Cartilages',
      'Colonne vertébrale',
      'Fascias',
      'Ligaments',
      'Membres inférieurs',
      'Membres supérieurs',
      'Moelle osseuse',
      'Muscles squelettiques',
      'Os',
      'Squelette axial',
      'Squelette appendiculaire',
      'Tendons',
    ],
  },
  {
    label: 'Appareil respiratoire',
    structures: [
      'Alvéoles pulmonaires',
      'Bronches',
      'Bronchioles',
      'Diaphragme',
      'Larynx',
      'Médiastin',
      'Nez et fosses nasales',
      'Pharynx respiratoire',
      'Plèvre',
      'Poumon gauche',
      'Poumon droit',
      'Sinus paranasaux',
      'Trachée',
    ],
  },
  {
    label: 'Appareil urinaire',
    structures: [
      'Bassinet rénal',
      'Calices rénaux',
      'Néphron',
      'Rein gauche',
      'Rein droit',
      'Uretères',
      'Urètre',
      'Vessie',
    ],
  },
  {
    label: 'Bouche et dentition',
    structures: [
      'Articulation temporomandibulaire',
      'Dents',
      'Gencives',
      'Glandes salivaires',
      'Langue',
      'Lèvres',
      'Muqueuse buccale',
      'Palais',
      'Parodonte',
      'Plancher buccal',
    ],
  },
  {
    label: 'Système endocrinien et métabolique',
    structures: [
      'Glandes parathyroïdes',
      'Glandes surrénales',
      'Hypophyse',
      'Hypothalamus',
      'Métabolisme des glucides',
      'Métabolisme des lipides',
      'Métabolisme des protéines',
      'Métabolisme hydroélectrolytique',
      'Ovaires — fonction endocrine',
      'Pancréas endocrine',
      'Testicules — fonction endocrine',
      'Thyroïde',
    ],
  },
  {
    label: 'Système hématologique',
    structures: [
      'Coagulation et hémostase',
      'Globules blancs',
      'Globules rouges',
      'Hémoglobine',
      'Moelle hématopoïétique',
      'Plasma',
      'Plaquettes',
      'Sang périphérique',
    ],
  },
  {
    label: 'Système immunitaire',
    structures: [
      'Anticorps et immunoglobulines',
      'Complément',
      'Cytokines',
      'Immunité adaptative',
      'Immunité innée',
      'Lymphocytes B',
      'Lymphocytes T',
      'Phagocytes',
    ],
  },
  {
    label: 'Système lymphatique',
    structures: [
      'Amygdales',
      'Canaux lymphatiques',
      'Capillaires lymphatiques',
      'Ganglions lymphatiques',
      'Lymphe',
      'Rate',
      'Tissu lymphoïde associé aux muqueuses',
      'Thymus',
      'Vaisseaux lymphatiques',
    ],
  },
  {
    label: 'Système nerveux',
    structures: [
      'Cerveau',
      'Cervelet',
      'Jonction neuromusculaire',
      'Méninges',
      'Moelle épinière',
      'Nerfs crâniens',
      'Nerfs périphériques',
      'Système nerveux autonome',
      'Système nerveux central',
      'Système nerveux parasympathique',
      'Système nerveux sympathique',
      'Tronc cérébral',
    ],
  },
  {
    label: 'Système sensoriel — audition et équilibre',
    structures: [
      'Caisse du tympan',
      'Canaux semi-circulaires',
      'Cochlée',
      'Nerf vestibulocochléaire',
      'Oreille externe',
      'Oreille interne',
      'Oreille moyenne',
      'Osselets',
      'Système vestibulaire',
      'Trompe auditive',
      'Tympan',
    ],
  },
  {
    label: 'Système sensoriel — vision',
    structures: [
      'Choroïde',
      'Conjonctive',
      'Cornée',
      'Cristallin',
      'Glandes lacrymales',
      'Iris',
      'Muscles oculomoteurs',
      'Nerf optique',
      'Orbite',
      'Paupières',
      'Rétine',
      'Sclère',
      'Uvéa',
      'Vitré',
    ],
  },
  {
    label: 'Système tégumentaire — peau et phanères',
    structures: [
      'Cheveux et poils',
      'Derme',
      'Épiderme',
      'Glandes sébacées',
      'Glandes sudoripares',
      'Hypoderme et tissu sous-cutané',
      'Muqueuses cutanées',
      'Ongles',
      'Peau',
    ],
  },
] as const;

export const bodySystems = bodySystemGroups.map((group) => group.label);

export const bodySystemStructures = bodySystemGroups.flatMap((group) => [
  group.label,
  ...group.structures.map((structure) => `${group.label} — ${structure}`),
]);

export function parseBodySystems(value?: string) {
  if (!value) return [];
  const entries = new Set(
    value
      .split(/\r?\n|\s·\s/u)
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  return bodySystemStructures.filter((structure) => entries.has(structure));
}

export function formatBodySystems(values: string[]) {
  const selected = new Set(values);
  return bodySystemStructures.filter((structure) => selected.has(structure)).join('\n');
}

export function icd10DisplayLabel(row: Icd10CatalogRow) {
  const [, label, parentLabel] = row;
  return parentLabel && parentLabel !== label ? `${parentLabel} — ${label}` : label;
}

export function parseDiagnosisCodes(value?: string) {
  return parseDiagnoses(value).map((diagnosis) => diagnosis.code);
}

export function parseDiagnoses(value?: string) {
  if (!value) return [];
  return value
    .split(/\r?\n/u)
    .map((line) => {
      const match = line.trim().match(/^([A-Z][0-9]{2}(?:\.[A-Z0-9]{1,3})?)(?:\s+[—-]\s+(.+))?$/u);
      return match ? { code: match[1]!, label: match[2]?.trim() || 'Libellé non renseigné' } : null;
    })
    .filter((diagnosis): diagnosis is { code: string; label: string } => Boolean(diagnosis));
}

export function formatDiagnoses(codes: string[], rows: Icd10CatalogRow[]) {
  const catalog = new Map(rows.map((row) => [row[0], row]));
  return codes
    .map((code) => {
      const row = catalog.get(code);
      return row ? `${code} — ${icd10DisplayLabel(row)}` : code;
    })
    .join('\n');
}

export const emptyClinical = {
  chiefComplaint: '',
  presentIllnessHistory: '',
  anamnesisComplements: '',
  medicalHistory: '',
  physicalExamination: '',
  paraclinicalExams: '',
  diagnosis: '',
  treatmentPlan: '',
  laboratoryInterpretation: '',
  postLaboratoryDiagnosis: '',
  postLaboratoryPlan: '',
  postLaboratoryNotes: '',
  decision: 'CONTINUE' as ConsultationDecision,
  amendmentReason: '',
};

export const decisionOptions: Array<{
  value: ConsultationDecision;
  label: string;
  detail: string;
}> = [
  {
    value: 'PRESCRIPTION',
    label: 'Prescrire et retour à domicile',
    detail:
      'Créer une ordonnance structurée et transmettre le patient au circuit caisse puis pharmacie.',
  },
  {
    value: 'HOSPITALIZATION',
    label: 'Hospitaliser',
    detail: 'Transmettre une indication médicale au service d’hospitalisation.',
  },
  {
    value: 'LABORATORY',
    label: 'Demander de nouveaux examens',
    detail: 'Maintenir la consultation ouverte et renvoyer le patient au laboratoire.',
  },
  {
    value: 'IMAGING',
    label: 'Envoyer en imagerie',
    detail: 'Créer un ordre d’imagerie sans clôturer le parcours médical.',
  },
  {
    value: 'TRANSFER',
    label: 'Transférer à un autre médecin',
    detail: 'Déplacer le même épisode vers la file du médecin destinataire.',
  },
  {
    value: 'FOLLOW_UP',
    label: 'Programmer un suivi ambulatoire',
    detail: 'Clôturer l’épisode actuel avec des consignes de contrôle et de suivi.',
  },
];

export const initialDecisionOptions = [
  {
    value: 'CONTINUE' as ConsultationDecision,
    label: 'Enregistrer l’évaluation',
    detail: 'Conserver la consultation active sans changer d’étape.',
  },
  ...decisionOptions.filter((option) =>
    ['LABORATORY', 'IMAGING', 'TRANSFER'].includes(option.value),
  ),
];

export const finalDecisions = new Set<ConsultationDecision>([
  'HOSPITALIZATION',
  'PRESCRIPTION',
  'FOLLOW_UP',
  'COMPLETE',
  'DISCHARGE',
]);

export const decisionGuidance: Record<ConsultationDecision, { title: string; detail: string }> = {
  CONTINUE: {
    title: 'Consultation active',
    detail: 'Enregistrez l’évaluation sans clôturer le parcours.',
  },
  LABORATORY: {
    title: 'Examens de laboratoire',
    detail:
      'L’évaluation initiale sera verrouillée après l’envoi. Le médecin devient disponible pendant les analyses.',
  },
  IMAGING: {
    title: 'Imagerie médicale',
    detail: 'Le patient quitte temporairement la consultation pendant l’examen.',
  },
  HOSPITALIZATION: {
    title: 'Indication d’hospitalisation',
    detail:
      'La sortie administrative restera distincte et dépendra du règlement intégral du séjour.',
  },
  TRANSFER: {
    title: 'Transfert médical',
    detail: 'Le même épisode rejoint la file du médecin destinataire.',
  },
  PRESCRIPTION: {
    title: 'Ordonnance et retour à domicile',
    detail: 'L’ordonnance structurée doit être enregistrée avant la clôture.',
  },
  FOLLOW_UP: {
    title: 'Suivi ambulatoire',
    detail: 'Ajoutez les consignes et la date de contrôle dans la conduite post-résultats.',
  },
  DISCHARGE: {
    title: 'Ancienne libération',
    detail: 'Cette décision est conservée uniquement pour la lecture des anciens dossiers.',
  },
  COMPLETE: {
    title: 'Ancienne clôture',
    detail: 'Cette décision est conservée uniquement pour la lecture des anciens dossiers.',
  },
};

export function formatDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function resultValues(exam: ConsultationExam) {
  const definitions = new Map((exam.resultSchema ?? []).map((field) => [field.key, field]));
  return (exam.resultData?.values ?? []).map((value) => ({
    ...value,
    label: definitions.get(value.key)?.label ?? value.key,
    unit: definitions.get(value.key)?.unit,
    reference: definitions.get(value.key)?.reference,
  }));
}

export function hasLaboratoryHistory(row: Consultation) {
  return row.examRequests.length > 0 || Boolean(row.clinicalReport?.preLaboratoryLockedAt);
}

export function consultationMode(row: Consultation): ConsultationFormMode {
  const stage = row.appointment?.journeyStage;
  if (stage === 'LABORATORY' || stage === 'IMAGING') return 'LABORATORY_VIEW';
  if (stage === 'HOSPITALIZATION') return 'HOSPITALIZATION_VIEW';
  if (
    hasLaboratoryHistory(row) &&
    row.examRequests.every((exam) => ['VALIDATED', 'CANCELLED'].includes(exam.status))
  ) {
    return row.status === 'COMPLETED' ? 'READ_ONLY' : 'POST_LABORATORY';
  }
  if (row.status === 'COMPLETED') return 'READ_ONLY';
  return 'INITIAL_ASSESSMENT';
}

export function actionLabel(row: Consultation) {
  const mode = consultationMode(row);
  if (mode === 'LABORATORY_VIEW') return 'Voir le passage au laboratoire';
  if (mode === 'POST_LABORATORY') return 'Interpréter les résultats';
  if (mode === 'HOSPITALIZATION_VIEW') return 'Voir l’orientation hospitalière';
  if (mode === 'READ_ONLY') return 'Consulter le dossier';
  return 'Ouvrir l’évaluation initiale';
}

export function workflowLabel(row: Consultation) {
  const stage = row.appointment?.journeyStage;
  if (stage === 'LABORATORY') return 'Au laboratoire — médecin disponible';
  if (stage === 'RETURN_TO_DOCTOR') return 'Résultats prêts — retour médecin';
  if (stage === 'IMAGING') return 'En imagerie — médecin disponible';
  if (stage === 'HOSPITALIZATION') return 'Orientation hospitalisation transmise';
  if (stage === 'WAITING_DOCTOR') return 'En attente du médecin';
  if (stage === 'COMPLETED') return 'Parcours terminé';
  return (
    decisionOptions.find((option) => option.value === row.clinicalReport?.decision)?.label ??
    row.orientation ??
    'Consultation active'
  );
}

export function saveLabel(decision: ConsultationDecision) {
  const labels: Record<ConsultationDecision, string> = {
    CONTINUE: 'Enregistrer l’évaluation',
    LABORATORY: 'Enregistrer et envoyer au laboratoire',
    IMAGING: 'Enregistrer et envoyer en imagerie',
    HOSPITALIZATION: 'Transmettre l’indication hospitalière',
    TRANSFER: 'Enregistrer et transférer',
    PRESCRIPTION: 'Clôturer avec l’ordonnance',
    FOLLOW_UP: 'Clôturer avec suivi ambulatoire',
    DISCHARGE: 'Action historique indisponible',
    COMPLETE: 'Action historique indisponible',
  };
  return labels[decision];
}

export function successMessage(decision: ConsultationDecision) {
  const messages: Record<ConsultationDecision, string> = {
    CONTINUE: 'L’évaluation clinique a été enregistrée.',
    LABORATORY:
      'Le patient a été envoyé au laboratoire. L’évaluation initiale est désormais verrouillée.',
    IMAGING: 'L’ordre d’imagerie a été transmis. Le médecin est disponible pendant l’examen.',
    HOSPITALIZATION:
      'L’indication d’hospitalisation a été transmise. La sortie administrative dépendra du règlement du séjour.',
    TRANSFER: 'Le patient a été transféré dans la file du médecin destinataire.',
    PRESCRIPTION: 'La consultation est clôturée avec une ordonnance structurée.',
    FOLLOW_UP: 'La consultation est clôturée avec un suivi ambulatoire.',
    DISCHARGE: 'Cette ancienne action n’est plus disponible.',
    COMPLETE: 'Cette ancienne action n’est plus disponible.',
  };
  return messages[decision];
}

export type ClinicalForm = typeof emptyClinical;
