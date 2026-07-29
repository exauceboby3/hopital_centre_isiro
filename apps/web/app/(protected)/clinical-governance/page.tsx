'use client';

import {
  Activity,
  BadgeDollarSign,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileHeart,
  HandCoins,
  HeartOff,
  Landmark,
  Plus,
  Printer,
  ShieldCheck,
  Stethoscope,
  WalletCards,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { localDateTimeInputValue, patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface FinancialInvoice {
  id: string;
  number: string;
  issuedAt: string;
  dueAt?: string | null;
  status: string;
  description: string;
  total: number;
  paid: number;
  covered: number;
  remaining: number;
}

interface PatientAdvance {
  id: string;
  number: string;
  amount: number;
  remainingAmount: number;
  method: string;
  reference?: string | null;
  receivedAt: string;
}

interface PaymentInstallment {
  id: string;
  sequence: number;
  amount: number;
  dueAt: string;
  status: string;
}

interface PaymentPlan {
  id: string;
  number: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  installments: PaymentInstallment[];
}

interface FinancialAccount {
  patient: Patient;
  totals: {
    totalBilled: number;
    totalPaid: number;
    coveredAmount: number;
    patientLiability: number;
    grossDebt: number;
    availableAdvance: number;
    netDebt: number;
    nextDueAt?: string | null;
    nextDueAmount?: number | null;
  };
  invoices: FinancialInvoice[];
  advances: PatientAdvance[];
  paymentPlans: PaymentPlan[];
}

interface EpisodeExam {
  id: string;
  type: string;
  status: string;
  requestedAt: string;
  validatedAt?: string | null;
}

interface EpisodePrescription {
  id: string;
  number: string;
  status: string;
  prescribedAt: string;
  items: Array<{
    id: string;
    dosage: string;
    frequency: string;
    route: string;
    durationDays: number;
    medication: { name: string };
  }>;
}

interface EpisodeNursingCare {
  id: string;
  label: string;
  status: string;
  scheduledAt: string;
  performedAt?: string | null;
  medicationName?: string | null;
  dose?: string | null;
  route?: string | null;
}

interface PatientEpisode {
  id: string;
  number: string;
  title: string;
  reason?: string | null;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  appointment?: {
    id: string;
    service: string;
    status: string;
    journeyStage: string;
    scheduledAt: string;
    doctor?: {
      lastName: string;
      postName?: string;
      firstName?: string;
      specialty: string;
    } | null;
    consultation?: {
      id: string;
      status: string;
      reason: string;
      report?: string | null;
      orientation?: string | null;
      examRequests: EpisodeExam[];
      prescriptions: EpisodePrescription[];
      nursingCare: EpisodeNursingCare[];
    } | null;
    careAuthorization?: { invoice: { number: string; status: string; total: string } } | null;
  } | null;
}

interface BreakGlassAccess {
  id: string;
  startedAt: string;
  expiresAt: string;
  reason: string;
}

interface DeathCaseDocument {
  death: {
    id: string;
    certificateNumber: string;
    occurredAt: string;
    cause: string;
    declaringDoctorName: string;
    declaringDoctorLicense?: string | null;
    morgueTransferredAt?: string | null;
    morgueLocation?: string | null;
    morgueRegisterNumber?: string | null;
    familyReleasedAt?: string | null;
    recipientName?: string | null;
    recipientIdentity?: string | null;
    recipientRelationship?: string | null;
    financialClosedAt?: string | null;
    notes?: string | null;
  };
  patient: Patient;
  hospital?: { name: string; legalName?: string | null; address?: string | null } | null;
  declaredBy?: { username: string } | null;
  financialClosedBy?: { username: string } | null;
}

interface CommandCenter {
  financial: FinancialAccount;
  episodes: PatientEpisode[];
  breakGlass?: BreakGlassAccess | null;
  death?: DeathCaseDocument | null;
}

interface BasicFinancialAccess {
  file: { active: boolean; validUntil?: string | null };
  grace?: {
    id: string;
    number: string;
    scope: string;
    reason: string;
    validUntil?: string | null;
  } | null;
  outstandingBalance: number;
  financialHold: boolean;
  death: { deceased: boolean };
}

interface PendingAdditionalExam {
  id: string;
  price: number;
  urgency: string;
  reason: string;
  requestedAt: string;
  exam?: {
    type: string;
    patient: Patient;
    careAuthorization?: { invoice?: { number: string } | null } | null;
  } | null;
}

interface GraceReportRow {
  id: string;
  number: string;
  patient: Patient;
  createdBy: { username: string };
  scope: string;
  reason: string;
  validFrom: string;
  validUntil: string;
  status: string;
  remainingMinutes: number;
  billedDuringGrace: number;
  paidDuringGrace: number;
  debtCreatedDuringGrace: number;
  acts: Array<{
    invoiceId: string;
    number: string;
    description: string;
    total: number;
    status: string;
    issuedAt: string;
  }>;
}

interface GraceReport {
  period: { from: string; to: string };
  totals: { authorizations: number; billed: number; debt: number };
  rows: GraceReportRow[];
}

const money = (value: number) => `${value.toLocaleString('fr-FR')} CDF`;
const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';
const localDate = (value = new Date()) => {
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
};
const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export default function ClinicalGovernancePage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [center, setCenter] = useState<CommandCenter | null>(null);
  const [financialAccess, setFinancialAccess] = useState<BasicFinancialAccess | null>(null);
  const [pendingExams, setPendingExams] = useState<PendingAdditionalExam[]>([]);
  const [graceReport, setGraceReport] = useState<GraceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: '',
    method: 'CASH',
    reference: '',
    notes: '',
  });
  const [allocationOpen, setAllocationOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState({ advanceId: '', invoiceId: '', amount: '' });
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({
    installmentCount: '3',
    firstDueAt: localDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    intervalDays: '30',
    notes: '',
  });
  const [episodeOpen, setEpisodeOpen] = useState(false);
  const [episodeForm, setEpisodeForm] = useState({ title: '', reason: '', openedAt: localDateTimeInputValue() });
  const [decision, setDecision] = useState<PendingAdditionalExam | null>(null);
  const [decisionForm, setDecisionForm] = useState({ decision: 'APPROVE', reason: '' });
  const [deathOpen, setDeathOpen] = useState(false);
  const [deathForm, setDeathForm] = useState({
    occurredAt: localDateTimeInputValue(),
    cause: '',
    declaringDoctorName: '',
    declaringDoctorLicense: '',
    morgueTransferredAt: '',
    morgueLocation: '',
    morgueRegisterNumber: '',
    notes: '',
  });
  const [deathUpdateOpen, setDeathUpdateOpen] = useState(false);
  const [deathUpdate, setDeathUpdate] = useState({
    morgueTransferredAt: '',
    morgueLocation: '',
    morgueRegisterNumber: '',
    familyReleasedAt: '',
    recipientName: '',
    recipientIdentity: '',
    recipientRelationship: '',
    closeFinancialAccount: false,
    notes: '',
  });

  const canManageMoney = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canCreateEpisode = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canDecideExam = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canManageDeath = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canUpdateDeath = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
    'ACCOUNTANT',
  ]);
  const canViewGraceReport = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);

  useEffect(() => {
    void api<{ items: Patient[] }>('/patients/lookup?limit=250')
      .then((result) => setPatients(result.items))
      .catch((reason) => notifyError(reason instanceof Error ? reason.message : 'Patients indisponibles.'));
  }, []);

  const loadGlobal = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    if (canDecideExam) {
      tasks.push(
        api<PendingAdditionalExam[]>('/clinical-governance/laboratory/additional-exams/pending')
          .then(setPendingExams)
          .catch(() => setPendingExams([])),
      );
    }
    if (canViewGraceReport) {
      tasks.push(
        api<GraceReport>('/clinical-governance/graces/report')
          .then(setGraceReport)
          .catch(() => setGraceReport(null)),
      );
    }
    await Promise.all(tasks);
  }, [canDecideExam, canViewGraceReport]);

  useEffect(() => {
    void loadGlobal();
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void loadGlobal();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [loadGlobal]);

  const loadPatient = useCallback(async (id: string) => {
    if (!id) {
      setCenter(null);
      setFinancialAccess(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [command, access] = await Promise.all([
        api<CommandCenter>(`/clinical-governance/patients/${id}/command-center`),
        api<BasicFinancialAccess>(`/patient-financial-access/${id}`),
      ]);
      setCenter(command);
      setFinancialAccess(access);
    } catch (reason) {
      setCenter(null);
      setFinancialAccess(null);
      setError(reason instanceof Error ? reason.message : 'Dossier de gouvernance indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPatient(patientId);
  }, [patientId, loadPatient]);

  const graceMinutes = useMemo(() => {
    const validUntil = financialAccess?.grace?.validUntil;
    return validUntil ? Math.max(Math.floor((new Date(validUntil).getTime() - now) / 60_000), 0) : null;
  }, [financialAccess?.grace?.validUntil, now]);

  const submitAdvance = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/patients/${patientId}/advances`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(advanceForm.amount),
          method: advanceForm.method,
          reference: advanceForm.reference.trim() || undefined,
          notes: advanceForm.notes.trim() || undefined,
        }),
      });
      setAdvanceOpen(false);
      setAdvanceForm({ amount: '', method: 'CASH', reference: '', notes: '' });
      notifySuccess('L’avance est enregistrée et disponible sur le compte du patient.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Avance impossible à enregistrer.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAllocation = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/patients/${patientId}/advances/allocate`, {
        method: 'POST',
        body: JSON.stringify({
          advanceId: allocationForm.advanceId,
          invoiceId: allocationForm.invoiceId,
          amount: Number(allocationForm.amount),
        }),
      });
      setAllocationOpen(false);
      setAllocationForm({ advanceId: '', invoiceId: '', amount: '' });
      notifySuccess('L’avance a été imputée à la facture sélectionnée.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Imputation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/patients/${patientId}/payment-plans`, {
        method: 'POST',
        body: JSON.stringify({
          installmentCount: Number(planForm.installmentCount),
          firstDueAt: new Date(`${planForm.firstDueAt}T12:00:00`).toISOString(),
          intervalDays: Number(planForm.intervalDays),
          notes: planForm.notes.trim() || undefined,
        }),
      });
      setPlanOpen(false);
      notifySuccess('L’échéancier a été créé sur la dette nette du patient.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Échéancier impossible à créer.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEpisode = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/patients/${patientId}/episodes`, {
        method: 'POST',
        body: JSON.stringify({
          title: episodeForm.title.trim(),
          reason: episodeForm.reason.trim() || undefined,
          openedAt: new Date(episodeForm.openedAt).toISOString(),
        }),
      });
      setEpisodeOpen(false);
      setEpisodeForm({ title: '', reason: '', openedAt: localDateTimeInputValue() });
      notifySuccess('Le nouvel épisode de soins est ouvert dans le dossier permanent.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Épisode impossible à créer.');
    } finally {
      setSubmitting(false);
    }
  };

  const closeEpisode = async (episodeId: string) => {
    setSubmitting(true);
    try {
      await api(`/clinical-governance/episodes/${episodeId}/close`, { method: 'PATCH' });
      notifySuccess('L’épisode est clôturé et reste consultable dans le dossier permanent.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Clôture impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDecision = async (event: FormEvent) => {
    event.preventDefault();
    if (!decision) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/laboratory/additional-exams/${decision.id}/decision`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision: decisionForm.decision,
          reason: decisionForm.reason.trim(),
        }),
      });
      notifySuccess(
        decisionForm.decision === 'APPROVE'
          ? 'L’examen complémentaire est médicalement approuvé.'
          : 'L’examen, son autorisation et sa facture ont été annulés.',
      );
      setDecision(null);
      setDecisionForm({ decision: 'APPROVE', reason: '' });
      await loadGlobal();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Décision impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDeath = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/patients/${patientId}/death-case`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: new Date(deathForm.occurredAt).toISOString(),
          cause: deathForm.cause.trim(),
          declaringDoctorName: deathForm.declaringDoctorName.trim(),
          declaringDoctorLicense: deathForm.declaringDoctorLicense.trim() || undefined,
          morgueTransferredAt: deathForm.morgueTransferredAt
            ? new Date(deathForm.morgueTransferredAt).toISOString()
            : undefined,
          morgueLocation: deathForm.morgueLocation.trim() || undefined,
          morgueRegisterNumber: deathForm.morgueRegisterNumber.trim() || undefined,
          notes: deathForm.notes.trim() || undefined,
        }),
      });
      setDeathOpen(false);
      notifySuccess('Le constat de décès et la clôture clinique ont été enregistrés.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Constat de décès impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDeathUpdate = async (event: FormEvent) => {
    event.preventDefault();
    const deathId = center?.death?.death.id;
    if (!deathId) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/death-cases/${deathId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          morgueTransferredAt: deathUpdate.morgueTransferredAt
            ? new Date(deathUpdate.morgueTransferredAt).toISOString()
            : undefined,
          morgueLocation: deathUpdate.morgueLocation.trim() || undefined,
          morgueRegisterNumber: deathUpdate.morgueRegisterNumber.trim() || undefined,
          familyReleasedAt: deathUpdate.familyReleasedAt
            ? new Date(deathUpdate.familyReleasedAt).toISOString()
            : undefined,
          recipientName: deathUpdate.recipientName.trim() || undefined,
          recipientIdentity: deathUpdate.recipientIdentity.trim() || undefined,
          recipientRelationship: deathUpdate.recipientRelationship.trim() || undefined,
          closeFinancialAccount: deathUpdate.closeFinancialAccount || undefined,
          notes: deathUpdate.notes.trim() || undefined,
        }),
      });
      setDeathUpdateOpen(false);
      notifySuccess('Le circuit morgue, famille et clôture financière a été actualisé.');
      await loadPatient(patientId);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Mise à jour du décès impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const printDeathDocument = () => {
    const documentData = center?.death;
    if (!documentData) return;
    const popup = window.open('', '_blank', 'width=900,height=1100');
    if (!popup) {
      notifyError('Le navigateur a bloqué la fenêtre d’impression.');
      return;
    }
    const death = documentData.death;
    const hospitalName = documentData.hospital?.legalName || documentData.hospital?.name || "Centre Hospitalier d’Isiro";
    popup.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(death.certificateNumber)}</title><style>body{font-family:Arial,sans-serif;margin:42px;color:#18231f}header{text-align:center;border-bottom:2px solid #222;padding-bottom:18px}h1{font-size:24px}dl{display:grid;grid-template-columns:220px 1fr;gap:12px;margin-top:32px}dt{font-weight:700}footer{margin-top:70px;display:flex;justify-content:space-between}.signature{width:280px;border-top:1px solid #222;padding-top:8px}@media print{button{display:none}}</style></head><body><header><strong>${escapeHtml(hospitalName)}</strong><h1>Certificat / constat de décès</h1><span>${escapeHtml(death.certificateNumber)}</span></header><dl><dt>Patient</dt><dd>${escapeHtml(patientName(documentData.patient))}</dd><dt>Numéro de dossier</dt><dd>${escapeHtml(documentData.patient.medicalRecordNumber)}</dd><dt>Date et heure du décès</dt><dd>${escapeHtml(dateTime(death.occurredAt))}</dd><dt>Cause / contexte</dt><dd>${escapeHtml(death.cause)}</dd><dt>Médecin déclarant</dt><dd>${escapeHtml(death.declaringDoctorName)}${death.declaringDoctorLicense ? ` — ${escapeHtml(death.declaringDoctorLicense)}` : ''}</dd><dt>Transfert à la morgue</dt><dd>${escapeHtml(dateTime(death.morgueTransferredAt))}</dd><dt>Lieu / registre morgue</dt><dd>${escapeHtml([death.morgueLocation, death.morgueRegisterNumber].filter(Boolean).join(' — ') || '—')}</dd><dt>Remise à la famille</dt><dd>${escapeHtml(dateTime(death.familyReleasedAt))}</dd><dt>Personne ayant réceptionné</dt><dd>${escapeHtml([death.recipientName, death.recipientIdentity, death.recipientRelationship].filter(Boolean).join(' — ') || '—')}</dd><dt>Clôture financière</dt><dd>${escapeHtml(dateTime(death.financialClosedAt))}</dd><dt>Observations</dt><dd>${escapeHtml(death.notes || '—')}</dd></dl><footer><div class="signature">Médecin déclarant</div><div class="signature">Administration / famille</div></footer><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const selectedPatient = patients.find((patient) => patient.id === patientId);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Sécurité clinique, sociale et financière</span>
          <h1>Gouvernance du dossier patient</h1>
          <p>
            Compte financier détaillé, épisodes de soins, échéanciers, mesures de grâce, décisions de laboratoire et circuit administratif du décès.
          </p>
        </div>
      </div>

      <section className="panel governance-patient-selector">
        <SearchableSelect
          className="full"
          label="Dossier permanent du patient"
          value={patientId}
          onChange={setPatientId}
          options={patients.map((patient) => ({
            value: patient.id,
            label: patientName(patient),
            description: patient.medicalRecordNumber,
          }))}
        />
      </section>

      {error && <div className="alert error">{error}</div>}
      {loading && <div className="empty-state"><Activity className="spin" /> Chargement du dossier complet…</div>}

      {center && selectedPatient && !loading && (
        <>
          <section className="governance-summary-grid">
            <article className="panel"><BadgeDollarSign /><span>Total facturé</span><strong>{money(center.financial.totals.totalBilled)}</strong></article>
            <article className="panel"><WalletCards /><span>Total encaissé</span><strong>{money(center.financial.totals.totalPaid)}</strong></article>
            <article className="panel"><ShieldCheck /><span>Prise en charge</span><strong>{money(center.financial.totals.coveredAmount)}</strong></article>
            <article className="panel"><HandCoins /><span>Avance disponible</span><strong>{money(center.financial.totals.availableAdvance)}</strong></article>
            <article className={`panel${center.financial.totals.netDebt > 0 ? ' governance-debt-card' : ''}`}><Landmark /><span>Dette nette</span><strong>{money(center.financial.totals.netDebt)}</strong><small>{center.financial.totals.nextDueAt ? `Prochaine échéance : ${dateTime(center.financial.totals.nextDueAt)} · ${money(center.financial.totals.nextDueAmount ?? 0)}` : 'Aucune échéance ouverte'}</small></article>
            <article className="panel"><FileHeart /><span>Fiche mensuelle</span><strong>{financialAccess?.file.active ? 'Active' : 'Inactive'}</strong><small>{financialAccess?.file.active ? `Valide jusqu’au ${dateTime(financialAccess.file.validUntil)}` : 'Renouvellement ou grâce requis'}</small></article>
          </section>

          {financialAccess?.grace && (
            <section className="panel governance-grace-current">
              <div>
                <span className="eyebrow">Mesure de grâce active</span>
                <strong>{financialAccess.grace.number}</strong>
                <p>{financialAccess.grace.reason}</p>
              </div>
              <div>
                <Clock3 />
                <strong>{graceMinutes ?? 0} minute(s)</strong>
                <span>restantes avant blocage automatique</span>
              </div>
            </section>
          )}

          <section className="panel table-panel">
            <div className="panel-toolbar">
              <div><strong>Relevé de compte patient</strong><span>{center.financial.invoices.length} facture(s)</span></div>
              {canManageMoney && (
                <div className="row-actions">
                  <button className="secondary-button compact" onClick={() => setAdvanceOpen(true)}><Plus size={16} /> Enregistrer une avance</button>
                  <button className="secondary-button compact" onClick={() => setAllocationOpen(true)} disabled={!center.financial.advances.some((advance) => advance.remainingAmount > 0) || !center.financial.invoices.some((invoice) => invoice.remaining > 0)}><HandCoins size={16} /> Imputer une avance</button>
                  <button className="secondary-button compact" onClick={() => setPlanOpen(true)} disabled={center.financial.totals.netDebt <= 0}><CalendarRange size={16} /> Créer un échéancier</button>
                </div>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Facture</th><th>Acte</th><th>Total</th><th>Payé</th><th>Couvert</th><th>Reste</th><th>Échéance</th><th>Statut</th></tr></thead>
                <tbody>
                  {center.financial.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td><strong>{invoice.number}</strong><br /><span className="muted">{dateTime(invoice.issuedAt)}</span></td>
                      <td>{invoice.description}</td>
                      <td>{money(invoice.total)}</td><td>{money(invoice.paid)}</td><td>{money(invoice.covered)}</td>
                      <td><strong>{money(invoice.remaining)}</strong></td><td>{dateTime(invoice.dueAt)}</td><td><StatusBadge status={invoice.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="governance-two-columns">
            <article className="panel">
              <div className="panel-heading"><div><span className="eyebrow">Crédit patient</span><h2>Avances disponibles</h2></div><HandCoins /></div>
              {center.financial.advances.length === 0 ? <div className="empty-state">Aucune avance enregistrée.</div> : center.financial.advances.map((advance) => (
                <div className="governance-list-row" key={advance.id}><div><strong>{advance.number}</strong><span>{dateTime(advance.receivedAt)} · {advance.method}</span></div><div><span>Initial : {money(advance.amount)}</span><strong>Disponible : {money(advance.remainingAmount)}</strong></div></div>
              ))}
            </article>
            <article className="panel">
              <div className="panel-heading"><div><span className="eyebrow">Paiement progressif</span><h2>Échéanciers</h2></div><CalendarRange /></div>
              {center.financial.paymentPlans.length === 0 ? <div className="empty-state">Aucun échéancier.</div> : center.financial.paymentPlans.map((plan) => (
                <details className="governance-details" key={plan.id} open={plan.status === 'ACTIVE'}><summary><strong>{plan.number}</strong><span>{money(plan.totalAmount)} · {plan.status}</span></summary><div>{plan.installments.map((installment) => <div className="governance-list-row" key={installment.id}><span>Échéance {installment.sequence} · {dateTime(installment.dueAt)}</span><strong>{money(installment.amount)} · {installment.status}</strong></div>)}</div></details>
              ))}
            </article>
          </section>

          <section className="panel">
            <div className="panel-toolbar">
              <div><strong>Dossier permanent et épisodes de soins</strong><span>{center.episodes.length} épisode(s) classé(s) par date</span></div>
              {canCreateEpisode && <button className="secondary-button compact" onClick={() => setEpisodeOpen(true)}><Plus size={16} /> Nouvel épisode</button>}
            </div>
            <div className="episode-list">
              {center.episodes.map((episode) => (
                <details className="episode-card" key={episode.id} open={episode.status === 'OPEN'}>
                  <summary><div><span className="eyebrow">{dateTime(episode.openedAt)}</span><strong>{episode.title}</strong><small>{episode.number} · {episode.reason || 'Motif non précisé'}</small></div><StatusBadge status={episode.status} /></summary>
                  <div className="episode-content">
                    {episode.appointment ? (
                      <>
                        <div className="patient-journey-detail"><div><strong>Rendez-vous</strong><span>{dateTime(episode.appointment.scheduledAt)}</span></div><div><strong>Service</strong><span>{episode.appointment.service}</span></div><div><strong>Médecin</strong><span>{episode.appointment.doctor ? `${patientName(episode.appointment.doctor)} · ${episode.appointment.doctor.specialty}` : '—'}</span></div><div><strong>Parcours</strong><StatusBadge status={episode.appointment.journeyStage} /></div></div>
                        {episode.appointment.consultation && <div className="episode-subfolders"><details open><summary>Consultation</summary><p>{episode.appointment.consultation.reason}</p>{episode.appointment.consultation.orientation && <p><strong>Orientation :</strong> {episode.appointment.consultation.orientation}</p>}</details><details><summary>Laboratoire ({episode.appointment.consultation.examRequests.length})</summary>{episode.appointment.consultation.examRequests.map((exam) => <div className="governance-list-row" key={exam.id}><span>{exam.type}</span><StatusBadge status={exam.status} /></div>)}</details><details><summary>Prescriptions ({episode.appointment.consultation.prescriptions.length})</summary>{episode.appointment.consultation.prescriptions.map((prescription) => <div key={prescription.id}><strong>{prescription.number}</strong>{prescription.items.map((item) => <p key={item.id}>{item.medication.name} · {item.dosage} · {item.frequency} · {item.route} · {item.durationDays} jour(s)</p>)}</div>)}</details><details><summary>Soins infirmiers ({episode.appointment.consultation.nursingCare.length})</summary>{episode.appointment.consultation.nursingCare.map((care) => <div className="governance-list-row" key={care.id}><span>{dateTime(care.scheduledAt)} · {care.label}{care.medicationName ? ` · ${care.medicationName} ${care.dose ?? ''}` : ''}</span><StatusBadge status={care.status} /></div>)}</details></div>}
                      </>
                    ) : <div className="empty-state">Épisode administratif ouvert sans rendez-vous lié.</div>}
                    {episode.status === 'OPEN' && canCreateEpisode && <div className="modal-actions"><button className="secondary-button" disabled={submitting} onClick={() => void closeEpisode(episode.id)}>Clôturer cet épisode</button></div>}
                  </div>
                </details>
              ))}
            </div>
          </section>

          {canDecideExam && pendingExams.length > 0 && (
            <section className="panel">
              <div className="panel-heading"><div><span className="eyebrow">Contrôle médical des coûts</span><h2>Examens complémentaires à confirmer</h2></div><ClipboardList /></div>
              {pendingExams.map((exam) => <div className="governance-list-row" key={exam.id}><div><strong>{exam.exam?.type ?? 'Examen complémentaire'}</strong><span>{exam.exam ? `${patientName(exam.exam.patient)} · ${exam.exam.patient.medicalRecordNumber}` : ''}</span><small>{exam.reason} · demandé le {dateTime(exam.requestedAt)}</small></div><div><strong>{money(exam.price)}</strong><button className="primary-button compact" onClick={() => { setDecision(exam); setDecisionForm({ decision: 'APPROVE', reason: '' }); }}>Décider</button></div></div>)}
            </section>
          )}

          {canViewGraceReport && graceReport && (
            <section className="panel table-panel">
              <div className="panel-heading"><div><span className="eyebrow">Contrôle social mensuel</span><h2>Rapport des mesures de grâce</h2></div><ShieldCheck /></div>
              <div className="governance-summary-inline"><span>{graceReport.totals.authorizations} autorisation(s)</span><strong>{money(graceReport.totals.billed)} facturés</strong><strong>{money(graceReport.totals.debt)} de dette créée</strong></div>
              <div className="table-scroll"><table><thead><tr><th>Patient</th><th>Autorisation</th><th>Durée restante</th><th>Actes</th><th>Facturé</th><th>Dette</th><th>Administrateur</th></tr></thead><tbody>{graceReport.rows.map((row) => <tr key={row.id}><td>{patientName(row.patient)}<br /><span className="muted">{row.patient.medicalRecordNumber}</span></td><td>{row.number}<br /><span className="muted">{row.reason}</span></td><td>{row.remainingMinutes} min<br /><span className="muted">{dateTime(row.validUntil)}</span></td><td>{row.acts.length}</td><td>{money(row.billedDuringGrace)}</td><td>{money(row.debtCreatedDuringGrace)}</td><td>{row.createdBy.username}</td></tr>)}</tbody></table></div>
            </section>
          )}

          <section className="panel death-governance-panel">
            <div className="panel-heading"><div><span className="eyebrow">Décès, morgue et famille</span><h2>Circuit administratif final</h2></div><HeartOff /></div>
            {center.death ? (
              <><div className="patient-journey-detail"><div><strong>Certificat</strong><span>{center.death.death.certificateNumber}</span></div><div><strong>Date du décès</strong><span>{dateTime(center.death.death.occurredAt)}</span></div><div><strong>Cause</strong><span>{center.death.death.cause}</span></div><div><strong>Médecin déclarant</strong><span>{center.death.death.declaringDoctorName}</span></div><div><strong>Morgue</strong><span>{[center.death.death.morgueLocation, center.death.death.morgueRegisterNumber].filter(Boolean).join(' · ') || 'Non renseignée'}</span></div><div><strong>Remise à la famille</strong><span>{center.death.death.recipientName || 'Non enregistrée'}</span></div><div><strong>Clôture financière</strong><span>{dateTime(center.death.death.financialClosedAt)}</span></div></div><div className="row-actions"><button className="secondary-button" onClick={printDeathDocument}><Printer size={17} /> Imprimer le constat</button>{canUpdateDeath && <button className="primary-button" onClick={() => setDeathUpdateOpen(true)}>Mettre à jour morgue / famille</button>}</div></>
            ) : canManageDeath ? <button className="danger-button" onClick={() => setDeathOpen(true)}><HeartOff size={17} /> Déclarer et documenter un décès</button> : <div className="empty-state">Aucun décès documenté.</div>}
          </section>
        </>
      )}

      {!patientId && !loading && <div className="empty-state"><Stethoscope /><strong>Sélectionnez un patient</strong><span>Le dossier permanent, les épisodes et le compte financier apparaîtront ici.</span></div>}

      {advanceOpen && <Modal title="Enregistrer une avance" eyebrow={selectedPatient ? patientName(selectedPatient) : 'Compte patient'} onClose={() => setAdvanceOpen(false)}><form onSubmit={submitAdvance}><div className="form-grid"><label className="field"><span>Montant en CDF *</span><input required type="number" min="1" step="0.01" value={advanceForm.amount} onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })} /></label><label className="field"><span>Moyen de paiement *</span><select value={advanceForm.method} onChange={(event) => setAdvanceForm({ ...advanceForm, method: event.target.value })}><option value="CASH">Espèces</option><option value="MOBILE_MONEY">Mobile Money</option><option value="BANK_TRANSFER">Virement bancaire</option><option value="CARD">Carte</option></select></label><label className="field full"><span>Référence</span><input value={advanceForm.reference} onChange={(event) => setAdvanceForm({ ...advanceForm, reference: event.target.value })} /></label><label className="field full"><span>Notes</span><textarea rows={3} value={advanceForm.notes} onChange={(event) => setAdvanceForm({ ...advanceForm, notes: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAdvanceOpen(false)}>Annuler</button><button className="primary-button" disabled={submitting}>Enregistrer l’avance</button></div></form></Modal>}

      {allocationOpen && center && <Modal title="Imputer une avance" eyebrow="Règlement d’une facture" onClose={() => setAllocationOpen(false)}><form onSubmit={submitAllocation}><div className="form-grid"><label className="field full"><span>Avance disponible *</span><select required value={allocationForm.advanceId} onChange={(event) => setAllocationForm({ ...allocationForm, advanceId: event.target.value })}><option value="">Sélectionner</option>{center.financial.advances.filter((advance) => advance.remainingAmount > 0).map((advance) => <option key={advance.id} value={advance.id}>{advance.number} — {money(advance.remainingAmount)}</option>)}</select></label><label className="field full"><span>Facture à régler *</span><select required value={allocationForm.invoiceId} onChange={(event) => setAllocationForm({ ...allocationForm, invoiceId: event.target.value })}><option value="">Sélectionner</option>{center.financial.invoices.filter((invoice) => invoice.remaining > 0).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number} — {invoice.description} — reste {money(invoice.remaining)}</option>)}</select></label><label className="field full"><span>Montant à imputer *</span><input required type="number" min="1" step="0.01" value={allocationForm.amount} onChange={(event) => setAllocationForm({ ...allocationForm, amount: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAllocationOpen(false)}>Annuler</button><button className="primary-button" disabled={submitting}>Imputer et valider</button></div></form></Modal>}

      {planOpen && <Modal title="Créer un échéancier" eyebrow="Dette nette du patient" onClose={() => setPlanOpen(false)}><form onSubmit={submitPlan}><div className="form-grid"><label className="field"><span>Nombre d’échéances *</span><input required type="number" min="1" max="12" value={planForm.installmentCount} onChange={(event) => setPlanForm({ ...planForm, installmentCount: event.target.value })} /></label><label className="field"><span>Première date limite *</span><input required type="date" value={planForm.firstDueAt} onChange={(event) => setPlanForm({ ...planForm, firstDueAt: event.target.value })} /></label><label className="field full"><span>Intervalle en jours *</span><input required type="number" min="1" max="90" value={planForm.intervalDays} onChange={(event) => setPlanForm({ ...planForm, intervalDays: event.target.value })} /></label><label className="field full"><span>Conditions / notes</span><textarea rows={3} value={planForm.notes} onChange={(event) => setPlanForm({ ...planForm, notes: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPlanOpen(false)}>Annuler</button><button className="primary-button" disabled={submitting}>Créer l’échéancier</button></div></form></Modal>}

      {episodeOpen && <Modal title="Ouvrir un épisode de soins" eyebrow="Sous-dossier du dossier permanent" onClose={() => setEpisodeOpen(false)}><form onSubmit={submitEpisode}><div className="form-grid"><label className="field full"><span>Titre de l’épisode *</span><input required minLength={3} value={episodeForm.title} onChange={(event) => setEpisodeForm({ ...episodeForm, title: event.target.value })} placeholder="Ex. crise palustre, suivi postopératoire…" /></label><label className="field full"><span>Date et heure d’ouverture *</span><input required type="datetime-local" value={episodeForm.openedAt} onChange={(event) => setEpisodeForm({ ...episodeForm, openedAt: event.target.value })} /></label><label className="field full"><span>Motif / problème principal</span><textarea rows={3} value={episodeForm.reason} onChange={(event) => setEpisodeForm({ ...episodeForm, reason: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setEpisodeOpen(false)}>Annuler</button><button className="primary-button" disabled={submitting}>Ouvrir le sous-dossier</button></div></form></Modal>}

      {decision && <Modal title="Décision médicale sur l’examen" eyebrow={decision.exam ? `${patientName(decision.exam.patient)} — ${decision.exam.type}` : 'Examen complémentaire'} onClose={() => setDecision(null)}><form onSubmit={submitDecision}><div className="patient-journey-detail"><div><strong>Prix</strong><span>{money(decision.price)}</span></div><div><strong>Urgence</strong><span>{decision.urgency}</span></div><div className="full"><strong>Justification du biologiste</strong><span>{decision.reason}</span></div></div><div className="form-grid"><label className="field full"><span>Décision *</span><select value={decisionForm.decision} onChange={(event) => setDecisionForm({ ...decisionForm, decision: event.target.value })}><option value="APPROVE">Approuver l’examen</option><option value="REJECT">Rejeter et annuler la facture</option></select></label><label className="field full"><span>Motif de la décision *</span><textarea required minLength={3} rows={3} value={decisionForm.reason} onChange={(event) => setDecisionForm({ ...decisionForm, reason: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDecision(null)}>Annuler</button><button className={decisionForm.decision === 'REJECT' ? 'danger-button' : 'primary-button'} disabled={submitting || decisionForm.reason.trim().length < 3}>{decisionForm.decision === 'REJECT' ? <XCircle size={17} /> : <CheckCircle2 size={17} />} Enregistrer la décision</button></div></form></Modal>}

      {deathOpen && <Modal title="Constat et certificat de décès" eyebrow={selectedPatient ? `${patientName(selectedPatient)} — ${selectedPatient.medicalRecordNumber}` : 'Dossier patient'} onClose={() => setDeathOpen(false)}><form onSubmit={submitDeath}><div className="alert warning">Cette action clôture les parcours, prescriptions, examens et soins actifs. Elle doit être effectuée par un professionnel habilité.</div><div className="form-grid"><label className="field"><span>Date et heure du décès *</span><input required type="datetime-local" value={deathForm.occurredAt} onChange={(event) => setDeathForm({ ...deathForm, occurredAt: event.target.value })} /></label><label className="field"><span>Médecin déclarant *</span><input required value={deathForm.declaringDoctorName} onChange={(event) => setDeathForm({ ...deathForm, declaringDoctorName: event.target.value })} /></label><label className="field full"><span>Cause / contexte *</span><textarea required minLength={3} rows={3} value={deathForm.cause} onChange={(event) => setDeathForm({ ...deathForm, cause: event.target.value })} /></label><label className="field"><span>Numéro d’ordre du médecin</span><input value={deathForm.declaringDoctorLicense} onChange={(event) => setDeathForm({ ...deathForm, declaringDoctorLicense: event.target.value })} /></label><label className="field"><span>Transfert à la morgue</span><input type="datetime-local" value={deathForm.morgueTransferredAt} onChange={(event) => setDeathForm({ ...deathForm, morgueTransferredAt: event.target.value })} /></label><label className="field"><span>Lieu de la morgue</span><input value={deathForm.morgueLocation} onChange={(event) => setDeathForm({ ...deathForm, morgueLocation: event.target.value })} /></label><label className="field"><span>Numéro du registre morgue</span><input value={deathForm.morgueRegisterNumber} onChange={(event) => setDeathForm({ ...deathForm, morgueRegisterNumber: event.target.value })} /></label><label className="field full"><span>Observations</span><textarea rows={3} value={deathForm.notes} onChange={(event) => setDeathForm({ ...deathForm, notes: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeathOpen(false)}>Annuler</button><button className="danger-button" disabled={submitting}>Confirmer le décès</button></div></form></Modal>}

      {deathUpdateOpen && center?.death && <Modal title="Morgue, remise à la famille et clôture" eyebrow={center.death.death.certificateNumber} onClose={() => setDeathUpdateOpen(false)}><form onSubmit={submitDeathUpdate}><div className="form-grid"><label className="field"><span>Transfert à la morgue</span><input type="datetime-local" value={deathUpdate.morgueTransferredAt} onChange={(event) => setDeathUpdate({ ...deathUpdate, morgueTransferredAt: event.target.value })} /></label><label className="field"><span>Lieu de la morgue</span><input value={deathUpdate.morgueLocation} onChange={(event) => setDeathUpdate({ ...deathUpdate, morgueLocation: event.target.value })} /></label><label className="field full"><span>Numéro du registre morgue</span><input value={deathUpdate.morgueRegisterNumber} onChange={(event) => setDeathUpdate({ ...deathUpdate, morgueRegisterNumber: event.target.value })} /></label><label className="field"><span>Date de remise du corps</span><input type="datetime-local" value={deathUpdate.familyReleasedAt} onChange={(event) => setDeathUpdate({ ...deathUpdate, familyReleasedAt: event.target.value })} /></label><label className="field"><span>Nom de la personne ayant réceptionné</span><input value={deathUpdate.recipientName} onChange={(event) => setDeathUpdate({ ...deathUpdate, recipientName: event.target.value })} /></label><label className="field"><span>Pièce / identité</span><input value={deathUpdate.recipientIdentity} onChange={(event) => setDeathUpdate({ ...deathUpdate, recipientIdentity: event.target.value })} /></label><label className="field"><span>Lien avec le défunt</span><input value={deathUpdate.recipientRelationship} onChange={(event) => setDeathUpdate({ ...deathUpdate, recipientRelationship: event.target.value })} /></label><label className="field full governance-checkbox"><input type="checkbox" checked={deathUpdate.closeFinancialAccount} onChange={(event) => setDeathUpdate({ ...deathUpdate, closeFinancialAccount: event.target.checked })} /><span>Confirmer la clôture financière finale du compte</span></label><label className="field full"><span>Observations</span><textarea rows={3} value={deathUpdate.notes} onChange={(event) => setDeathUpdate({ ...deathUpdate, notes: event.target.value })} /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeathUpdateOpen(false)}>Annuler</button><button className="primary-button" disabled={submitting}>Enregistrer le circuit final</button></div></form></Modal>}
    </>
  );
}
