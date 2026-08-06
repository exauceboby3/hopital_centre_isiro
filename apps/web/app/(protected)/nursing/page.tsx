'use client';

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardPlus,
  Clock3,
  Plus,
  ScanLine,
  Syringe,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { localDateTimeInputValue, patientName } from '@/lib/display';
import { buildNursingPatientGroups } from '@/lib/nursing-worklist';
import { hasAnyRole } from '@/lib/roles';
import { Patient, User } from '@/lib/types';

interface NursingCare {
  id: string;
  type: string;
  status: string;
  label: string;
  medicationName?: string;
  dose?: string;
  route?: string;
  site?: string;
  instructions?: string;
  scheduledAt: string;
  performedAt?: string;
  observations?: string;
  adverseReaction?: string;
  patient: Patient;
  orderedBy?: Pick<User, 'id' | 'username' | 'role'>;
  assignedNurse?: Pick<User, 'id' | 'username' | 'role'>;
  performedBy?: Pick<User, 'id' | 'username' | 'role'>;
  hospitalization?: { id: string; bed: { code: string; room: { name: string; code: string } } };
}

interface ActiveHospitalization {
  id: string;
  patient: Patient;
  bed: { code: string; room: { name: string; code: string } };
}

interface MedicationOption {
  id: string;
  name: string;
  form?: string | null;
  strength?: string | null;
  stockQuantity: number;
}

const careTypes = [
  ['INJECTION', 'Injection'],
  ['INFUSION', 'Perfusion'],
  ['MEDICATION', 'Administration de médicament'],
  ['DRESSING', 'Pansement'],
  ['WOUND_CARE', 'Soin de plaie'],
  ['SAMPLE_COLLECTION', 'Prélèvement'],
  ['VITAL_SIGNS', 'Paramètres vitaux'],
  ['HYGIENE', 'Soin d’hygiène'],
  ['MOBILIZATION', 'Mobilisation'],
  ['MONITORING', 'Surveillance clinique'],
  ['OTHER', 'Autre soin'],
] as const;

const emptyForm = {
  patientId: '',
  assignedNurseId: '',
  type: 'INJECTION',
  label: '',
  medicationName: '',
  dose: '',
  route: '',
  site: '',
  instructions: '',
  scheduledAt: '',
  frequencyHours: '',
  durationDays: '',
};

const emptyWardRound = {
  patientId: '',
  condition: '',
  observations: '',
  actions: '',
  temperatureC: '',
  pulse: '',
  oxygenPercent: '',
  unstable: false,
};

const emptyCompletion = {
  administeredDose: '',
  patientBarcode: '',
  medicationBarcode: '',
  observations: '',
  adverseReaction: '',
};

const emptyOmission = {
  administrationOutcome: 'MISSED',
  omissionReason: '',
  observations: '',
};

const formatDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );

export default function NursingPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<NursingCare[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [nurses, setNurses] = useState<User[]>([]);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [selectedMedicationId, setSelectedMedicationId] = useState('');
  const [activeHospitalizations, setActiveHospitalizations] = useState<ActiveHospitalization[]>([]);
  const [medicationAlertCount, setMedicationAlertCount] = useState(0);
  const [worklistNow, setWorklistNow] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [wardRoundOpen, setWardRoundOpen] = useState(false);
  const [wardRound, setWardRound] = useState(emptyWardRound);
  const [completing, setCompleting] = useState<NursingCare | null>(null);
  const [omitting, setOmitting] = useState<NursingCare | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [completion, setCompletion] = useState(emptyCompletion);
  const [omission, setOmission] = useState(emptyOmission);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canPerform = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'NURSE']);
  const canCancel = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canOrder = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [careRows, patientRows, users, stays, medicationRows] = await Promise.all([
        api<NursingCare[]>('/nursing-care'),
        api<{ items: Patient[] }>('/patients/lookup?limit=200'),
        api<User[]>('/users'),
        api<ActiveHospitalization[]>('/hospitalizations?status=ACTIVE'),
        api<MedicationOption[]>('/pharmacy/medications'),
      ]);
      setRows(careRows);
      setWorklistNow(new Date());
      const alertLimit = Date.now() + 30 * 60 * 1000;
      setMedicationAlertCount(
        careRows.filter(
          (row) =>
            ['INJECTION', 'INFUSION', 'MEDICATION'].includes(row.type) &&
            ['ORDERED', 'SCHEDULED'].includes(row.status) &&
            new Date(row.scheduledAt).getTime() <= alertLimit,
        ).length,
      );
      setPatients(patientRows.items);
      setNurses(
        users.filter((entry) => entry.role === 'NURSE' || entry.additionalRoles?.includes('NURSE')),
      );
      setActiveHospitalizations(stays);
      setMedications(medicationRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement des soins impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/nursing-care', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          assignedNurseId: form.assignedNurseId || undefined,
          medicationName: form.medicationName || undefined,
          dose: form.dose || undefined,
          route: form.route || undefined,
          site: form.site || undefined,
          instructions: form.instructions || undefined,
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          frequencyHours: form.frequencyHours ? Number(form.frequencyHours) : undefined,
          durationDays: form.durationDays ? Number(form.durationDays) : undefined,
        }),
      });
      setOpen(false);
      setForm(emptyForm);
      setSelectedMedicationId('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Création du soin impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const recordWardRound = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/nursing-care/ward-rounds', {
        method: 'POST',
        body: JSON.stringify({
          patientId: wardRound.patientId,
          condition: wardRound.condition,
          observations: wardRound.observations || undefined,
          actions: wardRound.actions || undefined,
          vitalSigns: {
            ...(wardRound.temperatureC ? { temperatureC: Number(wardRound.temperatureC) } : {}),
            ...(wardRound.pulse ? { pulse: Number(wardRound.pulse) } : {}),
            ...(wardRound.oxygenPercent ? { oxygenPercent: Number(wardRound.oxygenPercent) } : {}),
          },
          unstable: wardRound.unstable,
        }),
      });
      setWardRound(emptyWardRound);
      setWardRoundOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Enregistrement du tour de salle impossible.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const transition = async (
    row: NursingCare,
    status: string,
    details?: Record<string, string | undefined>,
  ) => {
    setSubmitting(true);
    setError('');
    try {
      await api(`/nursing-care/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...details }),
      });
      setCompleting(null);
      setOmitting(null);
      setCompletion(emptyCompletion);
      setOmission(emptyOmission);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mise à jour du soin impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const openAdministration = (row: NursingCare) => {
    setSelectedPatientId(null);
    setCompleting(row);
    setCompletion({ ...emptyCompletion, administeredDose: row.dose ?? '' });
  };

  const openOmission = (row: NursingCare) => {
    setSelectedPatientId(null);
    setOmitting(row);
    setOmission(emptyOmission);
  };

  const patientGroups = useMemo(
    () => buildNursingPatientGroups(rows, query, worklistNow),
    [query, rows, worklistNow],
  );
  const selectedGroup = useMemo(
    () =>
      selectedPatientId
        ? (buildNursingPatientGroups(rows, '', worklistNow).find(
            (group) => group.patient.id === selectedPatientId,
          ) ?? null)
        : null,
    [rows, selectedPatientId, worklistNow],
  );
  const activeInterventionCount = patientGroups.reduce(
    (total, group) => total + group.activeRows.length,
    0,
  );
  const medicationRequired = ['INJECTION', 'INFUSION', 'MEDICATION'].includes(form.type);
  const isMedicationAdministration = completing
    ? ['INJECTION', 'INFUSION', 'MEDICATION'].includes(completing.type)
    : false;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Administration sécurisée des soins</span>
          <h1>Soins infirmiers</h1>
          <p>
            Recherchez le patient ou son numéro de dossier, contrôlez la prescription et tracez
            l’heure, la dose, l’identité de l’infirmier et tout incident.
          </p>
        </div>
        <div className="row-actions">
          {canPerform && (
            <button className="secondary-button" onClick={() => setWardRoundOpen(true)}>
              <ClipboardPlus size={18} /> Noter un tour de salle
            </button>
          )}
          {canOrder && (
            <button
              className="primary-button"
              onClick={() => {
                setForm({ ...emptyForm, scheduledAt: localDateTimeInputValue() });
                setOpen(true);
              }}
            >
              <Plus size={18} /> Programmer un soin
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {medicationAlertCount > 0 && (
        <div className="alert warning">
          <Clock3 size={18} /> {medicationAlertCount} médicament(s) à administrer maintenant ou dans
          les 30 prochaines minutes.
        </div>
      )}
      <section className="panel table-panel">
        <div className="panel-toolbar">
          <div>
            <strong>Patients à prendre en charge</strong>
            <span>
              {patientGroups.length} patient(s) · {activeInterventionCount} soin(s) à réaliser
            </span>
          </div>
          <input
            className="table-search"
            placeholder="Rechercher un patient ou un soin…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="table-scroll">
          <table className="nursing-patient-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Chambre / lit</th>
                <th>Prochain soin</th>
                <th>Heure prévue</th>
                <th>Charge / progression</th>
                <th>Priorité</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Activity className="spin" /> Chargement…
                    </div>
                  </td>
                </tr>
              ) : patientGroups.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Syringe />
                      <strong>Aucun patient avec un soin à réaliser</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                patientGroups.map((group) => {
                  const nextCare = group.nextCare;
                  const location = nextCare.hospitalization;
                  const initials =
                    `${group.patient.lastName[0] ?? ''}${group.patient.firstName?.[0] ?? group.patient.postName?.[0] ?? ''}`.toUpperCase();

                  return (
                    <tr
                      key={group.patient.id}
                      className="nursing-patient-row"
                      role="button"
                      tabIndex={0}
                      aria-label={`Ouvrir les soins de ${patientName(group.patient)}`}
                      onClick={() => setSelectedPatientId(group.patient.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedPatientId(group.patient.id);
                        }
                      }}
                    >
                      <td>
                        <div className="nursing-patient-identity">
                          <span className="nursing-patient-avatar" aria-hidden="true">
                            {initials}
                          </span>
                          <div>
                            <strong>{patientName(group.patient)}</strong>
                            <span>{group.patient.medicalRecordNumber}</span>
                          </div>
                        </div>
                      </td>
                      <td className="nursing-location">
                        {location ? (
                          <>
                            <strong>{location.bed.room.name}</strong>
                            <br />
                            <span>Lit {location.bed.code}</span>
                          </>
                        ) : (
                          <span>Non hospitalisé</span>
                        )}
                      </td>
                      <td>
                        <div className="nursing-next-care">
                          <strong>{nextCare.label}</strong>
                          <span>
                            {nextCare.medicationName
                              ? [nextCare.medicationName, nextCare.dose, nextCare.route]
                                  .filter(Boolean)
                                  .join(' · ')
                              : nextCare.instructions ||
                                (careTypes.find(([value]) => value === nextCare.type)?.[1] ??
                                  nextCare.type)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{formatDateTime(nextCare.scheduledAt)}</strong>
                      </td>
                      <td>
                        <div className="nursing-workload">
                          <strong>{group.activeRows.length} à faire</strong>
                          <span className="muted">
                            {group.completedTodayCount} réalisé(s) aujourd’hui
                          </span>
                        </div>
                      </td>
                      <td>
                        {group.overdueCount > 0 ? (
                          <span className="nursing-priority overdue">
                            <AlertTriangle size={14} /> {group.overdueCount} en retard
                          </span>
                        ) : group.dueSoonCount > 0 ? (
                          <span className="nursing-priority due">
                            <Clock3 size={14} /> À faire maintenant
                          </span>
                        ) : (
                          <span className="nursing-priority">
                            <Clock3 size={14} /> À venir
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-button nursing-open-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPatientId(group.patient.id);
                          }}
                        >
                          Ouvrir les soins <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedGroup && (
        <Modal
          wide
          title={patientName(selectedGroup.patient)}
          eyebrow={`${selectedGroup.patient.medicalRecordNumber}${
            selectedGroup.nextCare.hospitalization
              ? ` · ${selectedGroup.nextCare.hospitalization.bed.room.name} · lit ${selectedGroup.nextCare.hospitalization.bed.code}`
              : ''
          }`}
          onClose={() => setSelectedPatientId(null)}
        >
          <div className="nursing-patient-summary">
            <article>
              <span>Soins à réaliser</span>
              <strong>{selectedGroup.activeRows.length}</strong>
            </article>
            <article>
              <span>En retard</span>
              <strong>{selectedGroup.overdueCount}</strong>
            </article>
            <article>
              <span>Dans les 30 minutes</span>
              <strong>{selectedGroup.dueSoonCount}</strong>
            </article>
            <article>
              <span>Réalisés aujourd’hui</span>
              <strong>{selectedGroup.completedTodayCount}</strong>
            </article>
          </div>
          <div className="nursing-care-list">
            {selectedGroup.activeRows.map((row) => {
              const scheduledTime = new Date(row.scheduledAt).getTime();
              const currentTime = worklistNow.getTime();
              const isOverdue = scheduledTime < currentTime;
              const isDueSoon = !isOverdue && scheduledTime <= currentTime + 30 * 60 * 1000;

              return (
                <article
                  key={row.id}
                  className={`nursing-care-card${isOverdue ? ' overdue' : isDueSoon ? ' due' : ''}`}
                >
                  <div className="nursing-care-heading">
                    <div>
                      <span className="nursing-care-time">
                        {isOverdue ? 'En retard · ' : isDueSoon ? 'À faire maintenant · ' : ''}
                        {formatDateTime(row.scheduledAt)}
                      </span>
                      <strong>{row.label}</strong>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="nursing-care-treatment">
                    <div>
                      <span>Type</span>
                      <strong>
                        {careTypes.find(([value]) => value === row.type)?.[1] ?? row.type}
                      </strong>
                    </div>
                    <div>
                      <span>Médicament / soin</span>
                      <strong>{row.medicationName || row.instructions || '—'}</strong>
                    </div>
                    <div>
                      <span>Dose / voie</span>
                      <strong>
                        {[row.dose, row.route, row.site].filter(Boolean).join(' · ') || '—'}
                      </strong>
                    </div>
                  </div>
                  {row.instructions && row.medicationName && (
                    <p className="nursing-care-instructions">
                      <strong>Consigne :</strong> {row.instructions}
                    </p>
                  )}
                  <div className="nursing-care-actions">
                    {canPerform && ['ORDERED', 'SCHEDULED', 'IN_PROGRESS'].includes(row.status) && (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => openAdministration(row)}
                      >
                        <CheckCircle2 size={16} /> Confirmer le soin
                      </button>
                    )}
                    {canPerform && ['ORDERED', 'SCHEDULED'].includes(row.status) && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openOmission(row)}
                      >
                        <Clock3 size={16} /> Non réalisé
                      </button>
                    )}
                    {canCancel && !['COMPLETED', 'CANCELLED'].includes(row.status) && (
                      <button
                        type="button"
                        className="text-button danger"
                        disabled={submitting}
                        onClick={() => void transition(row, 'CANCELLED')}
                      >
                        <XCircle size={15} /> Annuler
                      </button>
                    )}
                    <CustomFieldsEditor entity="NURSING_CARE" entityId={row.id} />
                  </div>
                </article>
              );
            })}
          </div>
        </Modal>
      )}

      {open && (
        <Modal
          title="Programmer un soin infirmier"
          eyebrow="Prescription médicale et horaire d’administration"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={create}>
            <div className="form-grid">
              <SearchableSelect
                required
                label="Patient"
                value={form.patientId}
                onChange={(patientId) => setForm({ ...form, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
              <SearchableSelect
                label="Infirmier responsable"
                value={form.assignedNurseId}
                onChange={(assignedNurseId) => setForm({ ...form, assignedNurseId })}
                options={nurses.map((nurse) => ({
                  value: nurse.id,
                  label: nurse.username,
                  description: 'Infirmier autorisé',
                }))}
                helpText="Sans attribution, le premier infirmier disponible peut prendre le soin."
              />
              <label className="field">
                <span>Type de soin *</span>
                <select
                  required
                  value={form.type}
                  onChange={(event) => setForm({ ...form, type: event.target.value })}
                >
                  {careTypes.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date et heure prévues *</span>
                <input
                  required
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
                />
              </label>
              {medicationRequired && (
                <>
                  <label className="field">
                    <span>Répéter toutes les (heures)</span>
                    <input
                      type="number"
                      min="1"
                      max="72"
                      value={form.frequencyHours}
                      onChange={(event) => setForm({ ...form, frequencyHours: event.target.value })}
                      placeholder="Ex. 8"
                    />
                  </label>
                  <label className="field">
                    <span>Durée du traitement (jours)</span>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={form.durationDays}
                      onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
                      placeholder="Ex. 7"
                    />
                  </label>
                </>
              )}
              <label className="field full">
                <span>Intitulé du soin *</span>
                <input
                  required
                  maxLength={160}
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                />
              </label>
              <SearchableSelect
                required={medicationRequired}
                label="Médicament"
                value={selectedMedicationId}
                onChange={(medicationId) => {
                  const medication = medications.find((entry) => entry.id === medicationId);
                  setSelectedMedicationId(medicationId);
                  setForm({ ...form, medicationName: medication?.name ?? '' });
                }}
                options={medications.map((medication) => ({
                  value: medication.id,
                  label: medication.name,
                  description: `${
                    [medication.form, medication.strength].filter(Boolean).join(' · ') ||
                    'Présentation non précisée'
                  } · stock ${medication.stockQuantity}`,
                }))}
                helpText="Sélection issue du catalogue de la pharmacie."
              />
              <label className="field">
                <span>Dose {medicationRequired ? '*' : ''}</span>
                <input
                  required={medicationRequired}
                  placeholder="Ex. 500 mg"
                  value={form.dose}
                  onChange={(event) => setForm({ ...form, dose: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Voie {medicationRequired ? '*' : ''}</span>
                <input
                  required={medicationRequired}
                  placeholder="IV, IM, orale…"
                  value={form.route}
                  onChange={(event) => setForm({ ...form, route: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Site</span>
                <input
                  placeholder="Bras droit, abdomen…"
                  value={form.site}
                  onChange={(event) => setForm({ ...form, site: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Instructions du médecin</span>
                <textarea
                  rows={3}
                  value={form.instructions}
                  onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Programmer et notifier
              </button>
            </div>
          </form>
        </Modal>
      )}

      {wardRoundOpen && (
        <Modal
          title="Tour de salle infirmier"
          eyebrow="Observation clinique d’un patient hospitalisé"
          onClose={() => setWardRoundOpen(false)}
        >
          <form onSubmit={recordWardRound}>
            <div className="form-grid">
              <SearchableSelect
                required
                label="Patient hospitalisé"
                value={wardRound.patientId}
                onChange={(patientId) => setWardRound({ ...wardRound, patientId })}
                options={activeHospitalizations.map((stay) => ({
                  value: stay.patient.id,
                  label: patientName(stay.patient),
                  description: `${stay.patient.medicalRecordNumber} · ${stay.bed.room.name} · lit ${stay.bed.code}`,
                }))}
              />
              <label className="field full">
                <span>État actuel du patient *</span>
                <textarea
                  required
                  minLength={3}
                  rows={3}
                  value={wardRound.condition}
                  onChange={(event) =>
                    setWardRound({ ...wardRound, condition: event.target.value })
                  }
                  placeholder="Conscience, douleur, respiration, mobilité, alimentation…"
                />
              </label>
              <label className="field">
                <span>Température (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  value={wardRound.temperatureC}
                  onChange={(event) =>
                    setWardRound({ ...wardRound, temperatureC: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Pouls (/min)</span>
                <input
                  type="number"
                  min="1"
                  value={wardRound.pulse}
                  onChange={(event) => setWardRound({ ...wardRound, pulse: event.target.value })}
                />
              </label>
              <label className="field">
                <span>SpO₂ (%)</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={wardRound.oxygenPercent}
                  onChange={(event) =>
                    setWardRound({ ...wardRound, oxygenPercent: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Observations infirmières</span>
                <textarea
                  rows={3}
                  value={wardRound.observations}
                  onChange={(event) =>
                    setWardRound({ ...wardRound, observations: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Actions réalisées / consignes à transmettre</span>
                <textarea
                  rows={3}
                  value={wardRound.actions}
                  onChange={(event) => setWardRound({ ...wardRound, actions: event.target.value })}
                />
              </label>
              <label className="checkbox-field full">
                <input
                  type="checkbox"
                  checked={wardRound.unstable}
                  onChange={(event) =>
                    setWardRound({ ...wardRound, unstable: event.target.checked })
                  }
                />
                <span>
                  <strong>Patient instable</strong>
                  <small>
                    Déclencher immédiatement une alerte critique sonore au médecin avec le dossier,
                    la chambre et le lit.
                  </small>
                </span>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setWardRoundOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer dans le dossier
              </button>
            </div>
          </form>
        </Modal>
      )}

      {completing && (
        <Modal
          title="Confirmer l’administration"
          eyebrow={`${patientName(completing.patient)} — ${completing.patient.medicalRecordNumber}`}
          onClose={() => setCompleting(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void transition(completing, 'COMPLETED', {
                administrationOutcome: 'ADMINISTERED',
                administeredDose: completion.administeredDose || undefined,
                patientBarcode: completion.patientBarcode || undefined,
                medicationBarcode: completion.medicationBarcode || undefined,
                observations: completion.observations || undefined,
                adverseReaction: completion.adverseReaction || undefined,
              });
            }}
          >
            <div className="patient-journey-detail nursing-administration-summary">
              <div>
                <strong>Soin</strong>
                <span>{completing.label}</span>
              </div>
              <div>
                <strong>Prévu</strong>
                <span>{formatDateTime(completing.scheduledAt)}</span>
              </div>
              <div>
                <strong>Médicament</strong>
                <span>{completing.medicationName || '—'}</span>
              </div>
              <div>
                <strong>Dose / voie</strong>
                <span>
                  {[completing.dose, completing.route, completing.site]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              {completing.instructions && (
                <div className="full">
                  <strong>Instructions</strong>
                  <span>{completing.instructions}</span>
                </div>
              )}
            </div>
            <div className="alert info">
              L’heure exacte, l’identité de l’infirmier et une signature numérique seront
              enregistrées automatiquement.
            </div>
            <div className="form-grid">
              {isMedicationAdministration && (
                <>
                  <label className="field">
                    <span>Dose réellement administrée *</span>
                    <input
                      required
                      value={completion.administeredDose}
                      onChange={(event) =>
                        setCompletion({ ...completion, administeredDose: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>
                      <ScanLine size={15} /> Code patient / bracelet
                    </span>
                    <input
                      value={completion.patientBarcode}
                      onChange={(event) =>
                        setCompletion({ ...completion, patientBarcode: event.target.value })
                      }
                      placeholder="Scanner ou saisir"
                    />
                  </label>
                  <label className="field full">
                    <span>
                      <ScanLine size={15} /> Code du médicament / lot
                    </span>
                    <input
                      value={completion.medicationBarcode}
                      onChange={(event) =>
                        setCompletion({ ...completion, medicationBarcode: event.target.value })
                      }
                      placeholder="Scanner ou saisir"
                    />
                  </label>
                </>
              )}
              <label className="field full">
                <span>Commentaire après le soin (facultatif)</span>
                <textarea
                  rows={3}
                  value={completion.observations}
                  onChange={(event) =>
                    setCompletion({ ...completion, observations: event.target.value })
                  }
                  placeholder="Ex. patient stable, douleur diminuée…"
                />
              </label>
              <label className="field full">
                <span>Réaction indésirable (facultatif)</span>
                <textarea
                  rows={3}
                  value={completion.adverseReaction}
                  onChange={(event) =>
                    setCompletion({ ...completion, adverseReaction: event.target.value })
                  }
                  placeholder="À renseigner uniquement en cas de réaction ou incident."
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCompleting(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                <CheckCircle2 size={17} /> Confirmer administré
              </button>
            </div>
          </form>
        </Modal>
      )}

      {omitting && (
        <Modal
          title="Signaler une non-administration"
          eyebrow={`${patientName(omitting.patient)} — ${omitting.patient.medicalRecordNumber}`}
          onClose={() => setOmitting(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void transition(omitting, 'MISSED', {
                administrationOutcome: omission.administrationOutcome,
                omissionReason: omission.omissionReason,
                observations: omission.observations || undefined,
              });
            }}
          >
            <div className="patient-journey-detail nursing-administration-summary">
              <div>
                <strong>Soin</strong>
                <span>{omitting.label}</span>
              </div>
              <div>
                <strong>Prévu</strong>
                <span>{formatDateTime(omitting.scheduledAt)}</span>
              </div>
              <div>
                <strong>Traitement</strong>
                <span>{omitting.medicationName || omitting.instructions || '—'}</span>
              </div>
              <div>
                <strong>Dose / voie</strong>
                <span>{[omitting.dose, omitting.route].filter(Boolean).join(' · ') || '—'}</span>
              </div>
            </div>
            <div className="form-grid">
              <label className="field full">
                <span>Situation *</span>
                <select
                  value={omission.administrationOutcome}
                  onChange={(event) =>
                    setOmission({ ...omission, administrationOutcome: event.target.value })
                  }
                >
                  <option value="MISSED">Dose manquée / hors délai</option>
                  <option value="REFUSED">Refus du patient</option>
                  <option value="OMITTED">Omission clinique justifiée</option>
                </select>
              </label>
              <label className="field full">
                <span>Motif obligatoire *</span>
                <textarea
                  required
                  minLength={3}
                  rows={3}
                  value={omission.omissionReason}
                  onChange={(event) =>
                    setOmission({ ...omission, omissionReason: event.target.value })
                  }
                  placeholder="Expliquer précisément pourquoi le soin ou la dose n’a pas été administré…"
                />
              </label>
              <label className="field full">
                <span>Commentaire complémentaire</span>
                <textarea
                  rows={3}
                  value={omission.observations}
                  onChange={(event) =>
                    setOmission({ ...omission, observations: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOmitting(null)}>
                Annuler
              </button>
              <button
                className="danger-button"
                disabled={submitting || omission.omissionReason.trim().length < 3}
              >
                Enregistrer la non-administration
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
