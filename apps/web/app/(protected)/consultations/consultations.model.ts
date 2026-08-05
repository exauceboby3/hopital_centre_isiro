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
