'use client';

import {
  Activity,
  CalendarClock,
  FileBadge,
  HeartOff,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  UserRoundSearch,
  WalletCards,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface FileStatus {
  active: boolean;
  authorizationId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  pending?: {
    id: string;
    invoiceId: string;
    invoiceNumber: string;
    amount: number;
    status: string;
  } | null;
}

interface GraceStatus {
  id: string;
  number: string;
  scope: 'ALL_CARE' | 'MEDICAL_CARE' | 'PHARMACY';
  reason: string;
  validFrom?: string | null;
  validUntil?: string | null;
}

interface FinancialSummary {
  patient: Patient;
  file: FileStatus;
  grace?: GraceStatus | null;
  outstandingBalance: number;
  financialHold: boolean;
  death: {
    deceased: boolean;
    occurredAt?: string | null;
    reason?: string | null;
    notes?: string | null;
  };
  policy: {
    monthlyFilePriceCdf: number;
    monthlyValidityDaysLabel: string;
    maximumGraceHours: number;
  };
}

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

interface FinancialAccount {
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
}

const scopeLabels: Record<GraceStatus['scope'], string> = {
  ALL_CARE: 'Tous les soins et médicaments',
  MEDICAL_CARE: 'Soins médicaux et examens',
  PHARMACY: 'Médicaments uniquement',
};

function localInput(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function graceRemaining(value?: string | null) {
  if (!value) return '—';
  const milliseconds = new Date(value).getTime() - Date.now();
  if (milliseconds <= 0) return 'Expirée';
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export default function FinancialAssistancePage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [graceOpen, setGraceOpen] = useState(false);
  const [deathOpen, setDeathOpen] = useState(false);
  const [graceForm, setGraceForm] = useState({
    scope: 'ALL_CARE' as GraceStatus['scope'],
    expiresAt: localInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    reason: '',
  });
  const [deathForm, setDeathForm] = useState({
    occurredAt: localInput(new Date()),
    reason: '',
    notes: '',
  });

  const canManageFile = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'CASHIER',
  ]);
  const canGrantGrace = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);
  const canDeclareDeath = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
  ]);

  useEffect(() => {
    void api<{ items: Patient[] }>('/patients/lookup?limit=200')
      .then((result) => setPatients(result.items))
      .catch((error) =>
        notifyError(error instanceof Error ? error.message : 'Patients indisponibles.'),
      );
  }, []);

  const loadSummary = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      setAccount(null);
      return;
    }
    setLoading(true);
    try {
      const [financialAccess, financialAccount] = await Promise.all([
        api<FinancialSummary>(`/patient-financial-access/${id}`),
        api<FinancialAccount>(`/clinical-governance/patients/${id}/financial-account`),
      ]);
      setSummary(financialAccess);
      setAccount(financialAccount);
    } catch (error) {
      setSummary(null);
      setAccount(null);
      notifyError(error instanceof Error ? error.message : 'Situation financière indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary(patientId);
  }, [patientId, loadSummary]);

  const renewFile = async () => {
    if (!patientId) return;
    setSubmitting(true);
    try {
      const result = await api<{ invoiceNumber?: string; invoice?: { number: string } }>(
        `/patient-financial-access/${patientId}/file-renewal`,
        { method: 'POST' },
      );
      const number = result.invoiceNumber ?? result.invoice?.number;
      notifySuccess(
        number ? `Facture ${number} créée pour la fiche mensuelle.` : 'Facture de fiche créée.',
        'Renouvellement enregistré',
      );
      await loadSummary(patientId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Renouvellement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const grantGrace = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/patient-financial-access/${patientId}/grace`, {
        method: 'POST',
        body: JSON.stringify({
          scope: graceForm.scope,
          expiresAt: new Date(graceForm.expiresAt).toISOString(),
          reason: graceForm.reason.trim(),
        }),
      });
      setGraceOpen(false);
      setGraceForm({
        scope: 'ALL_CARE',
        expiresAt: localInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
        reason: '',
      });
      notifySuccess('La mesure de grâce est active jusqu’à l’échéance définie.');
      await loadSummary(patientId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Autorisation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const revokeGrace = async () => {
    if (!summary?.grace) return;
    setSubmitting(true);
    try {
      await api(`/patient-financial-access/grace/${summary.grace.id}/revoke`, {
        method: 'PATCH',
      });
      notifySuccess('La mesure de grâce a été révoquée.');
      await loadSummary(patientId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Révocation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const declareDeath = async (event: FormEvent) => {
    event.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api(`/patient-financial-access/${patientId}/death`, {
        method: 'POST',
        body: JSON.stringify({
          occurredAt: new Date(deathForm.occurredAt).toISOString(),
          reason: deathForm.reason.trim(),
          notes: deathForm.notes.trim() || undefined,
        }),
      });
      setDeathOpen(false);
      notifySuccess('Le dossier du patient a été clôturé pour décès.');
      await loadSummary(patientId);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Déclaration du décès impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const latestAllowedGrace = useMemo(
    () => localInput(new Date(Date.now() + 72 * 60 * 60 * 1000)),
    [graceOpen],
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Gestion administrative du patient</span>
          <h1>Fiche et mesure de grâce</h1>
          <p>Contrôle de la fiche mensuelle, du solde patient et des autorisations temporaires.</p>
        </div>
      </div>

      <section className="panel financial-patient-selector">
        <div>
          <UserRoundSearch size={24} />
          <div>
            <strong>Rechercher un patient</strong>
            <span>Nom, post-nom, prénom ou numéro de dossier.</span>
          </div>
        </div>
        <SearchableSelect
          className="full"
          label="Patient"
          value={patientId}
          onChange={setPatientId}
          options={patients.map((patient) => ({
            value: patient.id,
            label: patientName(patient),
            description: patient.medicalRecordNumber,
          }))}
        />
      </section>

      {loading && (
        <div className="empty-state">
          <Activity className="spin" /> Chargement du compte patient…
        </div>
      )}

      {summary && account && !loading && (
        <>
          <section className="panel financial-patient-header">
            <div className="financial-patient-avatar">
              {summary.patient.lastName.slice(0, 1)}
              {summary.patient.firstName?.slice(0, 1)}
            </div>
            <div>
              <span className="eyebrow">{summary.patient.medicalRecordNumber}</span>
              <h2>{patientName(summary.patient)}</h2>
              <p>{summary.patient.phone || 'Téléphone non renseigné'}</p>
            </div>
            <StatusBadge status={summary.death.deceased ? 'CANCELLED' : 'ACTIVE'} />
          </section>

          <section className="panel financial-status-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Situation actuelle</span>
                <h2>Fiche, solde et autorisation</h2>
              </div>
              <FileBadge size={22} />
            </div>
            <div className="table-scroll">
              <table className="financial-status-table">
                <thead>
                  <tr>
                    <th>Élément</th>
                    <th>État</th>
                    <th>Référence</th>
                    <th>Validité / échéance</th>
                    <th>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Fiche patient mensuelle</strong><span>Renouvelable chaque mois</span></td>
                    <td><StatusBadge status={summary.file.active ? 'ACTIVE' : summary.file.invoiceStatus ?? 'PENDING'} /></td>
                    <td>{summary.file.invoiceNumber ?? summary.file.pending?.invoiceNumber ?? '—'}</td>
                    <td>{summary.file.active ? formatDate(summary.file.validUntil) : 'Non active'}</td>
                    <td>{currency(summary.policy.monthlyFilePriceCdf)}</td>
                  </tr>
                  <tr>
                    <td><strong>Solde patient</strong><span>Dette nette après paiements et prises en charge</span></td>
                    <td><StatusBadge status={account.totals.netDebt > 0 ? 'PENDING' : 'PAID'} /></td>
                    <td>{account.totals.nextDueAt ? `Échéance ${formatDate(account.totals.nextDueAt)}` : '—'}</td>
                    <td>{account.totals.nextDueAmount ? currency(account.totals.nextDueAmount) : 'Aucune échéance'}</td>
                    <td>{currency(account.totals.netDebt)}</td>
                  </tr>
                  <tr>
                    <td><strong>Mesure de grâce</strong><span>{summary.grace ? scopeLabels[summary.grace.scope] : 'Aucune autorisation active'}</span></td>
                    <td><StatusBadge status={summary.grace ? 'AUTHORIZED' : 'CANCELLED'} /></td>
                    <td>{summary.grace?.number ?? '—'}</td>
                    <td>{summary.grace ? `${formatDate(summary.grace.validUntil)} · ${graceRemaining(summary.grace.validUntil)}` : '—'}</td>
                    <td>Dette maintenue</td>
                  </tr>
                  <tr>
                    <td><strong>État du dossier</strong><span>{summary.death.deceased ? summary.death.reason || 'Décès déclaré' : 'Patient actif'}</span></td>
                    <td><StatusBadge status={summary.death.deceased ? 'CANCELLED' : 'ACTIVE'} /></td>
                    <td>{summary.death.deceased ? 'Dossier clôturé' : 'Dossier permanent'}</td>
                    <td>{summary.death.deceased ? formatDate(summary.death.occurredAt) : 'Sans expiration'}</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="financial-account-cards">
            <article className="panel"><span>Total facturé</span><strong>{currency(account.totals.totalBilled)}</strong></article>
            <article className="panel"><span>Total payé</span><strong>{currency(account.totals.totalPaid)}</strong></article>
            <article className="panel"><span>Prise en charge</span><strong>{currency(account.totals.coveredAmount)}</strong></article>
            <article className="panel"><span>Avance disponible</span><strong>{currency(account.totals.availableAdvance)}</strong></article>
          </section>

          {summary.grace && (
            <section className="panel grace-active-panel">
              <div>
                <span className="eyebrow">Autorisation temporaire active</span>
                <strong>{summary.grace.number} · {graceRemaining(summary.grace.validUntil)} restant</strong>
                <p>{summary.grace.reason}</p>
                <small>{scopeLabels[summary.grace.scope]} · fin le {formatDate(summary.grace.validUntil)}</small>
              </div>
              {canGrantGrace && (
                <button className="danger-button" disabled={submitting} onClick={() => void revokeGrace()}>
                  <ShieldX size={17} /> Révoquer
                </button>
              )}
            </section>
          )}

          <section className="panel financial-invoice-history">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Historique financier</span>
                <h2>Dernières factures</h2>
              </div>
              <WalletCards size={22} />
            </div>
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Référence</th><th>Libellé</th><th>Total</th><th>Payé / couvert</th><th>Reste</th><th>Statut</th></tr></thead>
                <tbody>
                  {account.invoices.slice(0, 12).map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{formatDate(invoice.issuedAt)}</td>
                      <td><strong>{invoice.number}</strong></td>
                      <td>{invoice.description}</td>
                      <td>{currency(invoice.total)}</td>
                      <td>{currency(invoice.paid + invoice.covered)}</td>
                      <td>{currency(invoice.remaining)}</td>
                      <td><StatusBadge status={invoice.status} /></td>
                    </tr>
                  ))}
                  {account.invoices.length === 0 && <tr><td colSpan={7}><div className="empty-state compact">Aucune facture.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel financial-access-actions">
            <div>
              <strong>Actions</strong>
              <span>Les autorisations sont horodatées et enregistrées dans l’audit.</span>
            </div>
            <div className="row-actions">
              {canManageFile && !summary.death.deceased && (
                <button className="secondary-button" disabled={submitting} onClick={() => void renewFile()}>
                  <RefreshCw size={17} /> Renouveler la fiche — 5 000 CDF
                </button>
              )}
              {canGrantGrace && !summary.death.deceased && (
                <button className="primary-button" onClick={() => setGraceOpen(true)}>
                  <CalendarClock size={17} /> Accorder une grâce
                </button>
              )}
              {canDeclareDeath && !summary.death.deceased && (
                <button className="danger-button" onClick={() => setDeathOpen(true)}>
                  <HeartOff size={17} /> Déclarer un décès
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {graceOpen && summary && (
        <Modal
          title="Accorder une mesure de grâce"
          eyebrow={`${patientName(summary.patient)} · ${summary.patient.medicalRecordNumber}`}
          onClose={() => setGraceOpen(false)}
        >
          <form onSubmit={grantGrace}>
            <div className="alert warning">
              Autorisation exceptionnelle limitée à 72 heures. Les montants facturés restent dus.
            </div>
            <div className="form-grid">
              <label className="field full">
                <span>Portée *</span>
                <select
                  required
                  value={graceForm.scope}
                  onChange={(event) =>
                    setGraceForm({ ...graceForm, scope: event.target.value as GraceStatus['scope'] })
                  }
                >
                  {Object.entries(scopeLabels).map(([value, label]) => (
                    <option value={value} key={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>Date et heure de fin *</span>
                <input
                  required
                  type="datetime-local"
                  min={localInput(new Date(Date.now() + 5 * 60 * 1000))}
                  max={latestAllowedGrace}
                  value={graceForm.expiresAt}
                  onChange={(event) => setGraceForm({ ...graceForm, expiresAt: event.target.value })}
                />
                <small>Le blocage financier reprend automatiquement à cette date et heure.</small>
              </label>
              <label className="field full">
                <span>Motif *</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  value={graceForm.reason}
                  onChange={(event) => setGraceForm({ ...graceForm, reason: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setGraceOpen(false)}>Annuler</button>
              <button className="primary-button" disabled={submitting}><ShieldCheck size={17} /> Autoriser</button>
            </div>
          </form>
        </Modal>
      )}

      {deathOpen && summary && (
        <Modal
          title="Déclarer le décès du patient"
          eyebrow={`${patientName(summary.patient)} · ${summary.patient.medicalRecordNumber}`}
          onClose={() => setDeathOpen(false)}
        >
          <form onSubmit={declareDeath}>
            <div className="alert error">Cette opération clôture les parcours cliniques actifs et libère le lit éventuel.</div>
            <div className="form-grid">
              <label className="field full">
                <span>Date et heure *</span>
                <input required type="datetime-local" max={localInput(new Date())} value={deathForm.occurredAt} onChange={(event) => setDeathForm({ ...deathForm, occurredAt: event.target.value })} />
              </label>
              <label className="field full">
                <span>Cause ou contexte *</span>
                <textarea required minLength={3} maxLength={500} rows={3} value={deathForm.reason} onChange={(event) => setDeathForm({ ...deathForm, reason: event.target.value })} />
              </label>
              <label className="field full">
                <span>Observations</span>
                <textarea maxLength={2000} rows={4} value={deathForm.notes} onChange={(event) => setDeathForm({ ...deathForm, notes: event.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setDeathOpen(false)}>Annuler</button>
              <button className="danger-button" disabled={submitting}>Confirmer le décès</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
