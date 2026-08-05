'use client';

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CalendarPlus,
  ClipboardCheck,
  FileSignature,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { localDateTimeInputValue, patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { Patient } from '@/lib/types';

type ActionKind =
  'TRIAGE' | 'ALERT' | 'IDENTITY' | 'CONSENT' | 'FOLLOW_UP' | 'DISCHARGE' | 'AMENDMENT' | null;

interface Appointment {
  id: string;
  patient: Patient;
  service: string;
  reason?: string | null;
  status: string;
  journeyStage: string;
  scheduledAt: string;
  consultation?: { id: string; status: string } | null;
}

interface Consultation {
  id: string;
  patient: Patient;
  status: string;
  reason: string;
  createdAt: string;
}

interface Hospitalization {
  id: string;
  patient: Patient;
  status: string;
  reason: string;
  admittedAt: string;
}

interface ClinicalAlert {
  id: string;
  type: string;
  severity: string;
  label: string;
  details?: string | null;
  createdAt: string;
  createdBy?: string;
}

interface TriageAssessment {
  id: string;
  level: string;
  chiefComplaint: string;
  painScore?: number | null;
  assessedAt: string;
  assessedBy?: string;
}

interface Consent {
  id: string;
  number: string;
  type: string;
  status: string;
  signedByName: string;
  signedAt: string;
}

interface FollowUp {
  id: string;
  type: string;
  scheduledAt: string;
  reminderChannel: string;
  notes?: string | null;
}

interface DischargeSummary {
  id: string;
  number: string;
  diagnoses: string;
  recommendations: string;
  signedAt?: string | null;
  createdAt: string;
}

interface SafetySummary {
  alerts: ClinicalAlert[];
  latestTriage?: TriageAssessment | null;
  consents: Consent[];
  upcomingFollowUps: FollowUp[];
  dischargeSummaries: DischargeSummary[];
}

const triageLabels: Record<string, string> = {
  RED: 'Rouge — urgence vitale',
  ORANGE: 'Orange — très urgent',
  YELLOW: 'Jaune — urgent',
  GREEN: 'Vert — stable',
  BLUE: 'Bleu — non urgent',
};

const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

const emptyTriage = {
  appointmentId: '',
  level: 'GREEN',
  chiefComplaint: '',
  painScore: '0',
  consciousness: '',
  breathing: '',
  bleeding: '',
  pregnancyStatus: '',
  notes: '',
};
const emptyAlert = { type: 'ALLERGY', severity: 'WARNING', label: '', details: '' };
const emptyIdentity = {
  context: 'CONSULTATION',
  nameConfirmed: false,
  recordNumberConfirmed: false,
  birthDateConfirmed: false,
  braceletCode: '',
  medicationCode: '',
  specimenCode: '',
  notes: '',
};
const emptyConsent = {
  type: 'SURGERY',
  signedByName: '',
  relationship: '',
  witnessName: '',
  details: '',
};
const emptyFollowUp = {
  type: 'CONSULTATION',
  scheduledAt: localDateTimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  reminderChannel: 'NONE',
  notes: '',
};
const emptyDischarge = {
  consultationId: '',
  hospitalizationId: '',
  admissionReason: '',
  diagnoses: '',
  examsPerformed: '',
  treatmentsReceived: '',
  dischargePrescription: '',
  recommendations: '',
  followUpInstructions: '',
  warningSigns: '',
  signNow: true,
};
const emptyAmendment = {
  entityType: 'Consultation',
  entityId: '',
  reason: '',
  previousValue: '{}',
  newValue: '{}',
};

export default function ClinicalSafetyPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>([]);
  const [patientId, setPatientId] = useState('');
  const [summary, setSummary] = useState<SafetySummary | null>(null);
  const [action, setAction] = useState<ActionKind>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [triage, setTriage] = useState(emptyTriage);
  const [alert, setAlert] = useState(emptyAlert);
  const [identity, setIdentity] = useState(emptyIdentity);
  const [consent, setConsent] = useState(emptyConsent);
  const [followUp, setFollowUp] = useState(emptyFollowUp);
  const [discharge, setDischarge] = useState(emptyDischarge);
  const [amendment, setAmendment] = useState(emptyAmendment);

  const loadReferences = useCallback(async () => {
    setLoading(true);
    try {
      const [patientRows, appointmentRows, consultationRows, stayRows] = await Promise.all([
        api<{ items: Patient[] }>('/patients/lookup?limit=250'),
        api<Appointment[]>('/appointments?scope=active'),
        api<Consultation[]>('/consultations'),
        api<Hospitalization[]>('/hospitalizations'),
      ]);
      setPatients(patientRows.items);
      setAppointments(appointmentRows);
      setConsultations(consultationRows);
      setHospitalizations(stayRows);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Chargement du centre clinique impossible.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async (id: string) => {
    if (!id) {
      setSummary(null);
      return;
    }
    try {
      setSummary(await api<SafetySummary>(`/clinical-safety/patients/${id}/summary`));
      setError('');
    } catch (reason) {
      setSummary(null);
      setError(reason instanceof Error ? reason.message : 'Résumé de sécurité indisponible.');
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadSummary(patientId);
  }, [patientId, loadSummary]);

  const patientAppointments = useMemo(
    () => appointments.filter((row) => row.patient.id === patientId),
    [appointments, patientId],
  );
  const patientConsultations = useMemo(
    () => consultations.filter((row) => row.patient.id === patientId),
    [consultations, patientId],
  );
  const patientStays = useMemo(
    () => hospitalizations.filter((row) => row.patient.id === patientId),
    [hospitalizations, patientId],
  );
  const selectedPatient = patients.find((patient) => patient.id === patientId);

  const completeAction = async (request: Promise<unknown>, message: string) => {
    setSubmitting(true);
    try {
      await request;
      notifySuccess(message);
      setAction(null);
      await Promise.all([loadSummary(patientId), loadReferences()]);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTriage = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/triage`, {
        method: 'POST',
        body: JSON.stringify({
          ...triage,
          appointmentId: triage.appointmentId || undefined,
          painScore: Number(triage.painScore),
          consciousness: triage.consciousness || undefined,
          breathing: triage.breathing || undefined,
          bleeding: triage.bleeding || undefined,
          pregnancyStatus: triage.pregnancyStatus || undefined,
          notes: triage.notes || undefined,
        }),
      }),
      'Le niveau de triage a été enregistré et influence maintenant l’ordre médical.',
    );
  };

  const submitAlert = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ ...alert, details: alert.details || undefined }),
      }),
      'L’alerte clinique permanente est visible dans le dossier du patient.',
    );
  };

  const submitIdentity = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/identity-verifications`, {
        method: 'POST',
        body: JSON.stringify({
          ...identity,
          braceletCode: identity.braceletCode || undefined,
          medicationCode: identity.medicationCode || undefined,
          specimenCode: identity.specimenCode || undefined,
          notes: identity.notes || undefined,
        }),
      }),
      'L’identité du patient a été confirmée et tracée.',
    );
  };

  const submitConsent = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/consents`, {
        method: 'POST',
        body: JSON.stringify({
          ...consent,
          relationship: consent.relationship || undefined,
          witnessName: consent.witnessName || undefined,
          details: consent.details || undefined,
        }),
      }),
      'Le consentement a été signé, horodaté et protégé par empreinte numérique.',
    );
  };

  const submitFollowUp = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/follow-ups`, {
        method: 'POST',
        body: JSON.stringify({
          ...followUp,
          scheduledAt: new Date(followUp.scheduledAt).toISOString(),
          notes: followUp.notes || undefined,
        }),
      }),
      'Le suivi médical a été programmé.',
    );
  };

  const submitDischarge = (event: FormEvent) => {
    event.preventDefault();
    void completeAction(
      api(`/clinical-safety/patients/${patientId}/discharge-summaries`, {
        method: 'POST',
        body: JSON.stringify({
          ...discharge,
          consultationId: discharge.consultationId || undefined,
          hospitalizationId: discharge.hospitalizationId || undefined,
          examsPerformed: discharge.examsPerformed || undefined,
          treatmentsReceived: discharge.treatmentsReceived || undefined,
          dischargePrescription: discharge.dischargePrescription || undefined,
          followUpInstructions: discharge.followUpInstructions || undefined,
          warningSigns: discharge.warningSigns || undefined,
        }),
      }),
      'Le résumé de sortie a été créé et ajouté au dossier permanent.',
    );
  };

  const submitAmendment = (event: FormEvent) => {
    event.preventDefault();
    try {
      const previousValue = JSON.parse(amendment.previousValue) as Record<string, unknown>;
      const newValue = JSON.parse(amendment.newValue) as Record<string, unknown>;
      void completeAction(
        api(`/clinical-safety/patients/${patientId}/amendments`, {
          method: 'POST',
          body: JSON.stringify({ ...amendment, previousValue, newValue }),
        }),
        'La demande de correction est enregistrée sans écraser la donnée originale.',
      );
    } catch {
      notifyError('Les anciennes et nouvelles valeurs doivent être du JSON valide.');
    }
  };

  const resolveAlert = async (id: string) => {
    await completeAction(
      api(`/clinical-safety/alerts/${id}/resolve`, { method: 'PATCH' }),
      'L’alerte clinique a été désactivée tout en restant dans l’historique.',
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Sécurité du malade</span>
          <h1>Centre de sécurité clinique</h1>
          <p>
            Triage, allergies, identitovigilance, consentements, suivi, résumé de sortie et
            corrections auditables.
          </p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel clinical-safety-selector">
        <div>
          <ShieldAlert size={25} />
          <div>
            <strong>Dossier permanent du patient</strong>
            <span>Sélectionnez le patient avant toute action sensible.</span>
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
          <Activity className="spin" /> Chargement…
        </div>
      )}

      {selectedPatient && (
        <>
          <section className="clinical-action-grid">
            <button
              onClick={() => {
                setTriage({ ...emptyTriage, appointmentId: patientAppointments[0]?.id ?? '' });
                setAction('TRIAGE');
              }}
            >
              <HeartPulse />{' '}
              <span>
                <strong>Triage</strong>
                <small>Priorité médicale</small>
              </span>
            </button>
            <button
              onClick={() => {
                setAlert(emptyAlert);
                setAction('ALERT');
              }}
            >
              <AlertTriangle />{' '}
              <span>
                <strong>Alerte clinique</strong>
                <small>Allergie ou risque</small>
              </span>
            </button>
            <button
              onClick={() => {
                setIdentity(emptyIdentity);
                setAction('IDENTITY');
              }}
            >
              <BadgeCheck />{' '}
              <span>
                <strong>Vérifier l’identité</strong>
                <small>Deux identifiants minimum</small>
              </span>
            </button>
            <button
              onClick={() => {
                setConsent(emptyConsent);
                setAction('CONSENT');
              }}
            >
              <FileSignature />{' '}
              <span>
                <strong>Consentement</strong>
                <small>Signature tracée</small>
              </span>
            </button>
            <button
              onClick={() => {
                setFollowUp(emptyFollowUp);
                setAction('FOLLOW_UP');
              }}
            >
              <CalendarPlus />{' '}
              <span>
                <strong>Programmer un suivi</strong>
                <small>Contrôle ou soin</small>
              </span>
            </button>
            <button
              onClick={() => {
                setDischarge(emptyDischarge);
                setAction('DISCHARGE');
              }}
            >
              <ClipboardCheck />{' '}
              <span>
                <strong>Résumé de sortie</strong>
                <small>Document médical</small>
              </span>
            </button>
            <button
              onClick={() => {
                setAmendment(emptyAmendment);
                setAction('AMENDMENT');
              }}
            >
              <Stethoscope />{' '}
              <span>
                <strong>Demander une correction</strong>
                <small>Sans écrasement</small>
              </span>
            </button>
          </section>

          <section className="clinical-safety-summary-grid">
            <article className="panel triage-summary-card">
              <span className="eyebrow">Dernier triage</span>
              {summary?.latestTriage ? (
                <>
                  <strong
                    className={`triage-value triage-${summary.latestTriage.level.toLowerCase()}`}
                  >
                    {triageLabels[summary.latestTriage.level] ?? summary.latestTriage.level}
                  </strong>
                  <p>{summary.latestTriage.chiefComplaint}</p>
                  <small>
                    {dateTime(summary.latestTriage.assessedAt)} · douleur{' '}
                    {summary.latestTriage.painScore ?? 0}/10
                  </small>
                </>
              ) : (
                <div className="empty-state compact">Aucun triage enregistré.</div>
              )}
            </article>

            <article className="panel">
              <span className="eyebrow">Alertes permanentes</span>
              <strong>{summary?.alerts.length ?? 0} alerte(s) active(s)</strong>
              <div className="clinical-mini-list">
                {summary?.alerts.slice(0, 4).map((row) => (
                  <div key={row.id}>
                    <StatusBadge status={row.severity} />
                    <span>
                      <b>{row.label}</b>
                      <small>{row.details || row.type}</small>
                    </span>
                    <button className="text-button" onClick={() => void resolveAlert(row.id)}>
                      Résoudre
                    </button>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <span className="eyebrow">Consentements</span>
              <strong>{summary?.consents.length ?? 0} document(s)</strong>
              <div className="clinical-mini-list">
                {summary?.consents.slice(0, 4).map((row) => (
                  <div key={row.id}>
                    <FileSignature size={17} />
                    <span>
                      <b>{row.type}</b>
                      <small>
                        {row.number} · {dateTime(row.signedAt)}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <span className="eyebrow">Suivis programmés</span>
              <strong>{summary?.upcomingFollowUps.length ?? 0} à venir</strong>
              <div className="clinical-mini-list">
                {summary?.upcomingFollowUps.slice(0, 4).map((row) => (
                  <div key={row.id}>
                    <CalendarPlus size={17} />
                    <span>
                      <b>{row.type}</b>
                      <small>
                        {dateTime(row.scheduledAt)} · {row.reminderChannel}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel full-span">
              <span className="eyebrow">Documents de sortie</span>
              <div className="clinical-document-list">
                {summary?.dischargeSummaries.length ? (
                  summary.dischargeSummaries.map((row) => (
                    <div key={row.id}>
                      <ClipboardCheck size={20} />
                      <span>
                        <strong>{row.number}</strong>
                        <small>
                          {row.diagnoses} · {dateTime(row.createdAt)}
                        </small>
                      </span>
                      <StatusBadge status={row.signedAt ? 'SIGNED' : 'DRAFT'} />
                    </div>
                  ))
                ) : (
                  <div className="empty-state compact">Aucun résumé de sortie.</div>
                )}
              </div>
            </article>
          </section>
        </>
      )}

      {action === 'TRIAGE' && (
        <Modal
          title="Évaluer la priorité médicale"
          eyebrow={
            selectedPatient
              ? `${patientName(selectedPatient)} — ${selectedPatient.medicalRecordNumber}`
              : ''
          }
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitTriage}>
            <div className="form-grid">
              <label className="field full">
                <span>Rendez-vous actif</span>
                <select
                  value={triage.appointmentId}
                  onChange={(event) => setTriage({ ...triage, appointmentId: event.target.value })}
                >
                  <option value="">Triage hors rendez-vous</option>
                  {patientAppointments.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.service} — {dateTime(row.scheduledAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Niveau *</span>
                <select
                  required
                  value={triage.level}
                  onChange={(event) => setTriage({ ...triage, level: event.target.value })}
                >
                  {Object.entries(triageLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Douleur /10</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={triage.painScore}
                  onChange={(event) => setTriage({ ...triage, painScore: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Motif principal *</span>
                <textarea
                  required
                  rows={3}
                  value={triage.chiefComplaint}
                  onChange={(event) => setTriage({ ...triage, chiefComplaint: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Conscience</span>
                <input
                  value={triage.consciousness}
                  onChange={(event) => setTriage({ ...triage, consciousness: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Respiration</span>
                <input
                  value={triage.breathing}
                  onChange={(event) => setTriage({ ...triage, breathing: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Saignement</span>
                <input
                  value={triage.bleeding}
                  onChange={(event) => setTriage({ ...triage, bleeding: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Grossesse</span>
                <input
                  value={triage.pregnancyStatus}
                  onChange={(event) =>
                    setTriage({ ...triage, pregnancyStatus: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Observations</span>
                <textarea
                  rows={3}
                  value={triage.notes}
                  onChange={(event) => setTriage({ ...triage, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer le triage
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'ALERT' && (
        <Modal
          title="Ajouter une alerte clinique"
          eyebrow="Visible avant prescription, soin et délivrance"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitAlert}>
            <div className="form-grid">
              <label className="field">
                <span>Type *</span>
                <select
                  value={alert.type}
                  onChange={(event) => setAlert({ ...alert, type: event.target.value })}
                >
                  <option value="ALLERGY">Allergie</option>
                  <option value="BLOOD_TYPE">Groupe sanguin</option>
                  <option value="CHRONIC_CONDITION">Maladie chronique</option>
                  <option value="CHRONIC_TREATMENT">Traitement chronique</option>
                  <option value="RISK">Risque</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="field">
                <span>Gravité *</span>
                <select
                  value={alert.severity}
                  onChange={(event) => setAlert({ ...alert, severity: event.target.value })}
                >
                  <option value="INFO">Information</option>
                  <option value="WARNING">Avertissement</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </label>
              <label className="field full">
                <span>Intitulé *</span>
                <input
                  required
                  value={alert.label}
                  onChange={(event) => setAlert({ ...alert, label: event.target.value })}
                  placeholder="Ex. Allergie sévère à la pénicilline"
                />
              </label>
              <label className="field full">
                <span>Détails</span>
                <textarea
                  rows={4}
                  value={alert.details}
                  onChange={(event) => setAlert({ ...alert, details: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Activer l’alerte
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'IDENTITY' && (
        <Modal
          title="Confirmer l’identité du patient"
          eyebrow="Identitovigilance avant acte sensible"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitIdentity}>
            <div className="form-grid">
              <label className="field full">
                <span>Contexte *</span>
                <select
                  value={identity.context}
                  onChange={(event) => setIdentity({ ...identity, context: event.target.value })}
                >
                  <option value="CONSULTATION">Consultation</option>
                  <option value="MEDICATION">Médicament</option>
                  <option value="SPECIMEN">Prélèvement</option>
                  <option value="TRANSFUSION">Transfusion</option>
                  <option value="SURGERY">Chirurgie</option>
                  <option value="RADIOLOGY">Imagerie</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={identity.nameConfirmed}
                  onChange={(event) =>
                    setIdentity({ ...identity, nameConfirmed: event.target.checked })
                  }
                />{' '}
                Nom complet confirmé
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={identity.recordNumberConfirmed}
                  onChange={(event) =>
                    setIdentity({ ...identity, recordNumberConfirmed: event.target.checked })
                  }
                />{' '}
                Numéro de dossier confirmé
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={identity.birthDateConfirmed}
                  onChange={(event) =>
                    setIdentity({ ...identity, birthDateConfirmed: event.target.checked })
                  }
                />{' '}
                Date de naissance confirmée
              </label>
              <label className="field">
                <span>Code bracelet</span>
                <input
                  value={identity.braceletCode}
                  onChange={(event) =>
                    setIdentity({ ...identity, braceletCode: event.target.value })
                  }
                />
              </label>
              {identity.context === 'MEDICATION' && (
                <label className="field">
                  <span>Code médicament *</span>
                  <input
                    required
                    value={identity.medicationCode}
                    onChange={(event) =>
                      setIdentity({ ...identity, medicationCode: event.target.value })
                    }
                  />
                </label>
              )}
              {identity.context === 'SPECIMEN' && (
                <label className="field">
                  <span>Code prélèvement *</span>
                  <input
                    required
                    value={identity.specimenCode}
                    onChange={(event) =>
                      setIdentity({ ...identity, specimenCode: event.target.value })
                    }
                  />
                </label>
              )}
              <label className="field full">
                <span>Note</span>
                <textarea
                  rows={3}
                  value={identity.notes}
                  onChange={(event) => setIdentity({ ...identity, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="alert info">Au moins deux identifiants doivent être confirmés.</div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Confirmer l’identité
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'CONSENT' && (
        <Modal
          title="Enregistrer un consentement"
          eyebrow="Signature du patient ou du représentant"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitConsent}>
            <div className="form-grid">
              <label className="field full">
                <span>Type *</span>
                <select
                  value={consent.type}
                  onChange={(event) => setConsent({ ...consent, type: event.target.value })}
                >
                  <option value="SURGERY">Chirurgie</option>
                  <option value="ANESTHESIA">Anesthésie</option>
                  <option value="TRANSFUSION">Transfusion</option>
                  <option value="SENSITIVE_EXAM">Examen sensible</option>
                  <option value="MEDICAL_PHOTO">Photographie médicale</option>
                  <option value="DATA_SHARING">Partage du dossier</option>
                  <option value="DISCHARGE_AGAINST_MEDICAL_ADVICE">
                    Sortie contre avis médical
                  </option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="field">
                <span>Signataire *</span>
                <input
                  required
                  value={consent.signedByName}
                  onChange={(event) => setConsent({ ...consent, signedByName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Lien avec le patient</span>
                <input
                  value={consent.relationship}
                  onChange={(event) => setConsent({ ...consent, relationship: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Témoin</span>
                <input
                  value={consent.witnessName}
                  onChange={(event) => setConsent({ ...consent, witnessName: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Contenu et conditions</span>
                <textarea
                  rows={5}
                  value={consent.details}
                  onChange={(event) => setConsent({ ...consent, details: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Signer et enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'FOLLOW_UP' && (
        <Modal
          title="Programmer le suivi"
          eyebrow="Après consultation ou hospitalisation"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitFollowUp}>
            <div className="form-grid">
              <label className="field">
                <span>Type *</span>
                <select
                  value={followUp.type}
                  onChange={(event) => setFollowUp({ ...followUp, type: event.target.value })}
                >
                  <option value="CONSULTATION">Consultation de contrôle</option>
                  <option value="DRESSING">Pansement</option>
                  <option value="LABORATORY">Laboratoire</option>
                  <option value="RADIOLOGY">Imagerie</option>
                  <option value="MEDICATION_RENEWAL">Renouvellement traitement</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="field">
                <span>Date et heure *</span>
                <input
                  required
                  type="datetime-local"
                  value={followUp.scheduledAt}
                  onChange={(event) =>
                    setFollowUp({ ...followUp, scheduledAt: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Rappel</span>
                <select
                  value={followUp.reminderChannel}
                  onChange={(event) =>
                    setFollowUp({ ...followUp, reminderChannel: event.target.value })
                  }
                >
                  <option value="NONE">Aucun</option>
                  <option value="SMS">SMS</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </label>
              <label className="field full">
                <span>Consignes</span>
                <textarea
                  rows={4}
                  value={followUp.notes}
                  onChange={(event) => setFollowUp({ ...followUp, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Programmer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'DISCHARGE' && (
        <Modal
          title="Créer le résumé de sortie"
          eyebrow="Document remis au patient"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitDischarge}>
            <div className="form-grid">
              <label className="field">
                <span>Consultation</span>
                <select
                  value={discharge.consultationId}
                  onChange={(event) =>
                    setDischarge({
                      ...discharge,
                      consultationId: event.target.value,
                      hospitalizationId: '',
                    })
                  }
                >
                  <option value="">—</option>
                  {patientConsultations.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.reason} — {dateTime(row.createdAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Hospitalisation</span>
                <select
                  value={discharge.hospitalizationId}
                  onChange={(event) =>
                    setDischarge({
                      ...discharge,
                      hospitalizationId: event.target.value,
                      consultationId: '',
                    })
                  }
                >
                  <option value="">—</option>
                  {patientStays.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.reason} — {dateTime(row.admittedAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>Motif d’admission *</span>
                <textarea
                  required
                  rows={3}
                  value={discharge.admissionReason}
                  onChange={(event) =>
                    setDischarge({ ...discharge, admissionReason: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Diagnostics *</span>
                <textarea
                  required
                  rows={3}
                  value={discharge.diagnoses}
                  onChange={(event) =>
                    setDischarge({ ...discharge, diagnoses: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Examens effectués</span>
                <textarea
                  rows={3}
                  value={discharge.examsPerformed}
                  onChange={(event) =>
                    setDischarge({ ...discharge, examsPerformed: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Traitements reçus</span>
                <textarea
                  rows={3}
                  value={discharge.treatmentsReceived}
                  onChange={(event) =>
                    setDischarge({ ...discharge, treatmentsReceived: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Ordonnance de sortie</span>
                <textarea
                  rows={3}
                  value={discharge.dischargePrescription}
                  onChange={(event) =>
                    setDischarge({ ...discharge, dischargePrescription: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Recommandations *</span>
                <textarea
                  required
                  rows={3}
                  value={discharge.recommendations}
                  onChange={(event) =>
                    setDischarge({ ...discharge, recommendations: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Suivi recommandé</span>
                <textarea
                  rows={3}
                  value={discharge.followUpInstructions}
                  onChange={(event) =>
                    setDischarge({ ...discharge, followUpInstructions: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Signes imposant un retour urgent</span>
                <textarea
                  rows={3}
                  value={discharge.warningSigns}
                  onChange={(event) =>
                    setDischarge({ ...discharge, warningSigns: event.target.value })
                  }
                />
              </label>
              <label className="check-field full">
                <input
                  type="checkbox"
                  checked={discharge.signNow}
                  onChange={(event) =>
                    setDischarge({ ...discharge, signNow: event.target.checked })
                  }
                />{' '}
                Signer le document maintenant
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || (!discharge.consultationId && !discharge.hospitalizationId)}
              >
                Créer le document
              </button>
            </div>
          </form>
        </Modal>
      )}

      {action === 'AMENDMENT' && (
        <Modal
          title="Demander une correction"
          eyebrow="Conservation obligatoire de l’ancienne valeur"
          onClose={() => setAction(null)}
        >
          <form onSubmit={submitAmendment}>
            <div className="form-grid">
              <label className="field">
                <span>Type de document *</span>
                <input
                  required
                  value={amendment.entityType}
                  onChange={(event) =>
                    setAmendment({ ...amendment, entityType: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Identifiant du document *</span>
                <input
                  required
                  value={amendment.entityId}
                  onChange={(event) => setAmendment({ ...amendment, entityId: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Motif *</span>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={amendment.reason}
                  onChange={(event) => setAmendment({ ...amendment, reason: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Ancienne valeur JSON *</span>
                <textarea
                  required
                  rows={4}
                  value={amendment.previousValue}
                  onChange={(event) =>
                    setAmendment({ ...amendment, previousValue: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Nouvelle valeur JSON *</span>
                <textarea
                  required
                  rows={4}
                  value={amendment.newValue}
                  onChange={(event) => setAmendment({ ...amendment, newValue: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAction(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Soumettre pour approbation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
