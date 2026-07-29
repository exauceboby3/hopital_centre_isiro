'use client';

import {
  Activity,
  BadgeCheck,
  CalendarDays,
  Clock3,
  FileSignature,
  HeartPulse,
  History as HistoryIcon,
  Pencil,
  Plus,
  Printer,
  Trash2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { hasAnyRole } from '@/lib/roles';
import { CustomFieldDefinition, Patient } from '@/lib/types';

interface PatientList {
  items: Patient[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface PatientForm {
  lastName: string;
  postName: string;
  firstName: string;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth: string;
  bloodType: string;
  phone: string;
  address: string;
  emergencyContact: string;
}

interface VitalSignForm {
  temperatureC: string;
  weightKg: string;
  heightCm: string;
  systolic: string;
  diastolic: string;
  pulse: string;
  respiratoryRate: string;
  oxygenPercent: string;
  bloodGlucoseMgDl: string;
  notes: string;
}

interface PatientHistoryEntry {
  id: string;
  kind: string;
  date: string;
  dateKey: string;
  title: string;
  description?: string;
  status?: string;
  author?: string;
  department?: string;
  signature?: { doctorName: string; signedAt: string; hash: string } | null;
}

interface PatientHistoryGroup {
  date: string;
  entries: PatientHistoryEntry[];
}

interface PatientHistory {
  patient: Patient;
  entries: PatientHistoryEntry[];
  groups: PatientHistoryGroup[];
  counts: Record<string, number>;
}

const historyLabels: Record<string, string> = {
  APPOINTMENT: 'Rendez-vous',
  CONSULTATION: 'Consultation',
  LABORATORY: 'Laboratoire',
  HOSPITALIZATION: 'Hospitalisation',
  VITAL_SIGN: 'Signes vitaux',
  PRESCRIPTION: 'Prescription',
  INVOICE: 'Facture',
  PAYMENT: 'Paiement',
  NURSING: 'Soin infirmier',
  CLINICAL_ORDER: 'Acte clinique',
  SPECIALTY: 'Dossier spécialisé',
  RADIOLOGY: 'Imagerie médicale',
};

const emptyForm: PatientForm = {
  lastName: '',
  postName: '',
  firstName: '',
  sex: 'MALE',
  dateOfBirth: '',
  bloodType: '',
  phone: '',
  address: '',
  emergencyContact: '',
};

const emptyVitals: VitalSignForm = {
  temperatureC: '',
  weightKg: '',
  heightCm: '',
  systolic: '',
  diastolic: '',
  pulse: '',
  respiratoryRate: '',
  oxygenPercent: '',
  bloodGlucoseMgDl: '',
  notes: '',
};

const vitalFields: Array<{
  key: Exclude<keyof VitalSignForm, 'notes'>;
  label: string;
}> = [
  { key: 'temperatureC', label: 'Température (°C)' },
  { key: 'weightKg', label: 'Poids (kg)' },
  { key: 'heightCm', label: 'Taille (cm)' },
  { key: 'systolic', label: 'Tension systolique' },
  { key: 'diastolic', label: 'Tension diastolique' },
  { key: 'pulse', label: 'Fréquence cardiaque / min' },
  { key: 'respiratoryRate', label: 'Fréquence respiratoire / min' },
  { key: 'oxygenPercent', label: 'Saturation O₂ (%)' },
  { key: 'bloodGlucoseMgDl', label: 'Glycémie (mg/dL)' },
];

const fullName = (patient: Patient) =>
  [patient.lastName, patient.postName, patient.firstName].filter(Boolean).join(' ');

function ageOf(dateOfBirth?: string) {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) age -= 1;
  return Math.max(0, age);
}

function hasVitals(form: VitalSignForm) {
  return Object.values(form).some((value) => value.trim() !== '');
}

function vitalPayload(form: VitalSignForm) {
  return Object.fromEntries(
    Object.entries(form)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [key, key === 'notes' ? value.trim() : Number(value)]),
  );
}

export default function PatientsPage() {
  const { user } = useAuth();
  const canCreatePatient = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
  ]);
  const canEditPatient = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'DOCTOR',
    'MEDICAL_BIOLOGIST',
  ]);
  const canRecordVitals = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'NURSE',
  ]);
  const canDeletePatient = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [vitalsPatient, setVitalsPatient] = useState<Patient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingVitals, setSubmittingVitals] = useState(false);
  const [deletingPatientId, setDeletingPatientId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [vitalsError, setVitalsError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [vitalsForm, setVitalsForm] = useState(emptyVitals);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, string | boolean>>({});
  const [history, setHistory] = useState<PatientHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadPatients = useCallback(async (term = '', sex = '') => {
    setLoading(true);
    setError('');
    try {
      const parameters = new URLSearchParams({ limit: '50' });
      if (term.trim()) parameters.set('search', term.trim());
      if (sex) parameters.set('sex', sex);
      const result = await api<PatientList>(`/patients?${parameters}`);
      setPatients(result.items);
      setTotal(result.pagination.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPatients(search, sexFilter), 250);
    return () => window.clearTimeout(timeout);
  }, [search, sexFilter, loadPatients]);

  useEffect(() => {
    void api<CustomFieldDefinition[]>('/configuration/custom-fields?entity=PATIENT')
      .then(setCustomFields)
      .catch(() => setCustomFields([]));
  }, []);

  const updateField = (field: keyof PatientForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateVital = (field: keyof VitalSignForm, value: string) => {
    setVitalsForm((current) => ({ ...current, [field]: value }));
  };

  const openNewPatient = () => {
    setEditingPatient(null);
    setForm(emptyForm);
    setVitalsForm(emptyVitals);
    setCustomValues({});
    setModalOpen(true);
  };

  const openPatient = async (patient: Patient) => {
    setError('');
    try {
      const details = await api<Patient>(`/patients/${patient.id}`);
      setEditingPatient(details);
      setForm({
        lastName: details.lastName,
        postName: details.postName ?? '',
        firstName: details.firstName ?? '',
        sex: details.sex,
        dateOfBirth: details.dateOfBirth?.slice(0, 10) ?? '',
        bloodType: details.bloodType ?? '',
        phone: details.phone ?? '',
        address: details.address ?? '',
        emergencyContact: details.emergencyContact ?? '',
      });
      setVitalsForm(emptyVitals);
      setCustomValues(
        Object.fromEntries(
          (details.customFields ?? []).map((row) => [row.definition.key, row.value]),
        ) as Record<string, string | boolean>,
      );
      setModalOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dossier patient indisponible.');
    }
  };

  const savePatient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setNotice('');
    let savedPatient: Patient | null = null;

    try {
      const normalizedCustomFields = Object.fromEntries(
        customFields
          .filter(
            (field) =>
              Boolean(editingPatient) ||
              (customValues[field.key] !== '' && customValues[field.key] !== undefined),
          )
          .map((field) => [
            field.key,
            field.type === 'NUMBER' ? Number(customValues[field.key]) : customValues[field.key],
          ]),
      );
      savedPatient = await api<Patient>(editingPatient ? `/patients/${editingPatient.id}` : '/patients', {
        method: editingPatient ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...Object.fromEntries(
            Object.entries(form).filter(
              ([key, value]) => Boolean(editingPatient) || key === 'sex' || value !== '',
            ),
          ),
          ...(editingPatient && !form.dateOfBirth ? { dateOfBirth: undefined } : {}),
          customFields: normalizedCustomFields,
        }),
      });

      if (canRecordVitals && hasVitals(vitalsForm)) {
        await api(`/patients/${savedPatient.id}/vitals`, {
          method: 'POST',
          body: JSON.stringify(vitalPayload(vitalsForm)),
        });
      }

      setNotice(
        editingPatient
          ? `Les informations du dossier ${editingPatient.medicalRecordNumber} ont été corrigées${hasVitals(vitalsForm) ? ' et les nouvelles constantes ont été enregistrées' : ''}.`
          : `Le nouveau patient a été enregistré${hasVitals(vitalsForm) ? ' avec ses signes vitaux' : ''}.`,
      );
      setForm(emptyForm);
      setVitalsForm(emptyVitals);
      setCustomValues({});
      setEditingPatient(null);
      setModalOpen(false);
      await loadPatients(search, sexFilter);
    } catch (reason) {
      if (savedPatient) {
        setEditingPatient(savedPatient);
        setNotice(`Le dossier ${savedPatient.medicalRecordNumber} a bien été enregistré.`);
        setError(
          reason instanceof Error
            ? `Les informations du patient sont enregistrées, mais les signes vitaux ont échoué : ${reason.message}`
            : 'Les informations du patient sont enregistrées, mais les signes vitaux n’ont pas pu être ajoutés.',
        );
        await loadPatients(search, sexFilter);
      } else {
        setError(reason instanceof Error ? reason.message : "Impossible d'enregistrer le patient.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openVitals = (patient: Patient) => {
    setVitalsPatient(patient);
    setVitalsForm(emptyVitals);
    setVitalsError('');
  };

  const saveVitals = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vitalsPatient || !hasVitals(vitalsForm)) {
      setVitalsError('Renseignez au moins une constante.');
      return;
    }

    setSubmittingVitals(true);
    setVitalsError('');
    try {
      await api(`/patients/${vitalsPatient.id}/vitals`, {
        method: 'POST',
        body: JSON.stringify(vitalPayload(vitalsForm)),
      });
      setNotice(`Les signes vitaux de ${fullName(vitalsPatient)} ont été enregistrés.`);
      setVitalsPatient(null);
      setVitalsForm(emptyVitals);
    } catch (reason) {
      setVitalsError(
        reason instanceof Error ? reason.message : 'Signes vitaux impossibles à enregistrer.',
      );
    } finally {
      setSubmittingVitals(false);
    }
  };

  const openHistory = async (patient: Patient) => {
    setHistoryLoading(true);
    setError('');
    try {
      setHistory(await api<PatientHistory>(`/patients/${patient.id}/history`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Historique du patient indisponible.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const deletePatient = async (patient: Patient) => {
    const confirmed = window.confirm(
      'Voulez-vous vraiment placer ce patient dans la corbeille ?\n\n' +
        `Le dossier ${patient.medicalRecordNumber} restera récupérable par le super-administrateur.`,
    );
    if (!confirmed) return;

    setDeletingPatientId(patient.id);
    setError('');
    setNotice('');
    try {
      await api(`/patients/${patient.id}`, { method: 'DELETE' });
      setHistory((current) => (current?.patient.id === patient.id ? null : current));
      setNotice(`Le dossier ${patient.medicalRecordNumber} a été déplacé dans la corbeille.`);
      await loadPatients(search, sexFilter);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.');
    } finally {
      setDeletingPatientId(null);
    }
  };

  const renderVitalFields = () => (
    <>
      {vitalFields.map(({ key, label }) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input
            type="number"
            step="any"
            value={vitalsForm[key]}
            onChange={(event) => updateVital(key, event.target.value)}
          />
        </label>
      ))}
      <label className="field full">
        <span>Observations sur les constantes</span>
        <textarea
          rows={3}
          value={vitalsForm.notes}
          onChange={(event) => updateVital('notes', event.target.value)}
        />
      </label>
    </>
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Identification et dossier médical unique</span>
          <h1>Patients</h1>
          <p>{total.toLocaleString('fr-FR')} dossier(s) actif(s), sans doublon de parcours.</p>
        </div>
        {canCreatePatient && (
          <button className="primary-button" onClick={openNewPatient}>
            <Plus size={18} /> Nouveau patient
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="panel table-panel">
        <ListFilters
          query={search}
          onQueryChange={setSearch}
          placeholder="Nom, numéro de dossier, téléphone…"
          status={sexFilter}
          onStatusChange={setSexFilter}
          allLabel="Tous les sexes"
          statusOptions={[
            { value: 'MALE', label: 'Masculin' },
            { value: 'FEMALE', label: 'Féminin' },
          ]}
          resultCount={total}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Dossier</th>
                <th>Sexe / âge</th>
                <th>Contact</th>
                <th>Groupe sanguin</th>
                <th>Création</th>
                <th>Signes vitaux</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Activity className="spin" size={24} /> Chargement des dossiers…
                    </div>
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <UserRound size={28} />
                      <strong>Aucun patient trouvé</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                patients.map((patient) => {
                  const age = ageOf(patient.dateOfBirth);
                  return (
                    <tr key={patient.id}>
                      <td>
                        <div className="person-cell">
                          <div className="avatar small">
                            {patient.lastName.slice(0, 1)}
                            {patient.firstName?.slice(0, 1)}
                          </div>
                          <div>
                            <strong>{fullName(patient)}</strong>
                            <span>{patient.address || 'Adresse non renseignée'}</span>
                          </div>
                        </div>
                      </td>
                      <td><span className="record-number">{patient.medicalRecordNumber}</span></td>
                      <td>
                        {patient.sex === 'MALE' ? 'Masculin' : 'Féminin'}
                        {age !== null ? ` · ${age} ans` : ''}
                      </td>
                      <td>
                        {patient.phone || '—'}
                        <br />
                        <span className="muted">Urgence : {patient.emergencyContact || '—'}</span>
                      </td>
                      <td>{patient.bloodType || '—'}</td>
                      <td>{new Intl.DateTimeFormat('fr-FR').format(new Date(patient.createdAt))}</td>
                      <td>
                        {canRecordVitals ? (
                          <button className="text-button" onClick={() => openVitals(patient)}>
                            <HeartPulse size={15} /> Saisir
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions compact-actions">
                          <Link className="text-button" href={`/print?kind=patient&id=${patient.id}`}>
                            <Printer size={15} /> Dossier
                          </Link>
                          <button
                            className="text-button"
                            disabled={historyLoading}
                            onClick={() => void openHistory(patient)}
                          >
                            <HistoryIcon size={15} /> Historique
                          </button>
                          {canEditPatient && (
                            <button className="text-button" onClick={() => void openPatient(patient)}>
                              <Pencil size={15} /> Corriger
                            </button>
                          )}
                          {canDeletePatient && (
                            <button
                              className="text-button danger"
                              disabled={deletingPatientId === patient.id}
                              onClick={() => void deletePatient(patient)}
                              title="Placer le dossier dans la corbeille"
                            >
                              {deletingPatientId === patient.id ? (
                                <Activity className="spin" size={15} />
                              ) : (
                                <Trash2 size={15} />
                              )}
                              Supprimer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal
          wide
          title={editingPatient ? 'Corriger les informations du patient' : 'Identification du malade'}
          eyebrow={editingPatient ? editingPatient.medicalRecordNumber : 'Réception'}
          onClose={() => setModalOpen(false)}
        >
          <form onSubmit={savePatient} className="clinical-consultation-form">
            <div className="patient-number-notice">
              <BadgeCheck size={19} />
              <div>
                <strong>
                  {editingPatient
                    ? `Numéro patient permanent : ${editingPatient.medicalRecordNumber}`
                    : 'Numéro patient permanent attribué automatiquement'}
                </strong>
                <span>
                  La réception saisit l’identité, les coordonnées et les signes vitaux d’accueil.
                  L’examen médical reste réservé au médecin.
                </span>
              </div>
            </div>

            <section className="clinical-form-section">
              <div className="section-title">
                <span>1</span>
                <div>
                  <strong>Identification du malade</strong>
                  <small>Identité et coordonnées administratives</small>
                </div>
              </div>
              <div className="form-grid">
                <label className="field"><span>Nom *</span><input required minLength={2} maxLength={100} value={form.lastName} onChange={(event) => updateField('lastName', event.target.value)} /></label>
                <label className="field"><span>Post-nom</span><input maxLength={100} value={form.postName} onChange={(event) => updateField('postName', event.target.value)} /></label>
                <label className="field"><span>Prénom</span><input maxLength={100} value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} /></label>
                <label className="field"><span>Sexe *</span><select value={form.sex} onChange={(event) => updateField('sex', event.target.value)}><option value="MALE">Masculin</option><option value="FEMALE">Féminin</option></select></label>
                <label className="field"><span>Date de naissance</span><input type="date" value={form.dateOfBirth} onChange={(event) => updateField('dateOfBirth', event.target.value)} /></label>
                <label className="field"><span>Groupe sanguin</span><select value={form.bloodType} onChange={(event) => updateField('bloodType', event.target.value)}><option value="">Non renseigné</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="field"><span>Contact / téléphone</span><input maxLength={30} value={form.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
                <label className="field"><span>Contact d’urgence</span><input maxLength={255} value={form.emergencyContact} onChange={(event) => updateField('emergencyContact', event.target.value)} /></label>
                <label className="field full"><span>Adresse</span><textarea rows={2} maxLength={255} value={form.address} onChange={(event) => updateField('address', event.target.value)} /></label>
                {customFields.map((field) => (
                  <label className={`field ${field.type === 'TEXTAREA' ? 'full' : ''}`} key={field.id}>
                    <span>{field.label} {field.required && '*'}</span>
                    {field.type === 'TEXTAREA' ? (
                      <textarea required={field.required} rows={3} placeholder={field.placeholder} value={String(customValues[field.key] ?? '')} onChange={(event) => setCustomValues({ ...customValues, [field.key]: event.target.value })} />
                    ) : field.type === 'SELECT' ? (
                      <select required={field.required} value={String(customValues[field.key] ?? '')} onChange={(event) => setCustomValues({ ...customValues, [field.key]: event.target.value })}>
                        <option value="">Sélectionner</option>
                        {(field.options ?? []).map((option) => <option key={option}>{option}</option>)}
                      </select>
                    ) : field.type === 'BOOLEAN' ? (
                      <select required={field.required} value={String(customValues[field.key] ?? '')} onChange={(event) => setCustomValues({ ...customValues, [field.key]: event.target.value === 'true' })}>
                        <option value="">Sélectionner</option><option value="true">Oui</option><option value="false">Non</option>
                      </select>
                    ) : (
                      <input required={field.required} type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'} placeholder={field.placeholder} value={String(customValues[field.key] ?? '')} onChange={(event) => setCustomValues({ ...customValues, [field.key]: event.target.value })} />
                    )}
                    {field.helpText && <small>{field.helpText}</small>}
                  </label>
                ))}
              </div>
            </section>

            {canRecordVitals && (
              <section className="clinical-form-section">
                <div className="section-title">
                  <span>2</span>
                  <div>
                    <strong>Signes vitaux d’accueil</strong>
                    <small>
                      {editingPatient
                        ? 'Ajoutez une nouvelle prise de constantes sans effacer les mesures précédentes.'
                        : 'Saisissez les constantes pendant l’enregistrement du patient.'}
                    </small>
                  </div>
                </div>
                <div className="form-grid">{renderVitalFields()}</div>
              </section>
            )}

            <div className="modal-actions clinical-actions">
              <button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting && <Activity className="spin" size={18} />}
                {editingPatient ? 'Enregistrer les corrections' : 'Enregistrer le patient'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {vitalsPatient && (
        <Modal
          wide
          title={`Signes vitaux · ${fullName(vitalsPatient)}`}
          eyebrow={vitalsPatient.medicalRecordNumber}
          onClose={() => setVitalsPatient(null)}
        >
          <form onSubmit={saveVitals}>
            {vitalsError && <div className="alert error">{vitalsError}</div>}
            <div className="patient-number-notice">
              <HeartPulse size={19} />
              <div>
                <strong>Nouvelle prise de constantes</strong>
                <span>Cette mesure sera ajoutée à l’historique du patient sans remplacer les précédentes.</span>
              </div>
            </div>
            <div className="form-grid">{renderVitalFields()}</div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setVitalsPatient(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submittingVitals || !hasVitals(vitalsForm)}>
                {submittingVitals ? <Activity className="spin" size={17} /> : <HeartPulse size={17} />}
                Enregistrer les signes vitaux
              </button>
            </div>
          </form>
        </Modal>
      )}

      {history && (
        <Modal
          wide
          title={fullName(history.patient)}
          eyebrow={`Dossier longitudinal · ${history.patient.medicalRecordNumber}`}
          onClose={() => setHistory(null)}
        >
          <div className="patient-history-summary">
            <div><HistoryIcon size={22} /><span><strong>{history.entries.length}</strong> acte(s) et événement(s)</span></div>
            <p>Chaque date regroupe les actes, leurs auteurs, services, statuts et signatures.</p>
          </div>
          {history.groups.length === 0 ? (
            <div className="empty-state"><Clock3 size={28} /><strong>Aucun événement médical enregistré</strong></div>
          ) : (
            <div className="patient-history-timeline">
              {history.groups.map((group) => (
                <section className="patient-history-date-group" key={group.date}>
                  <div className="patient-history-date-header">
                    <CalendarDays size={16} />{' '}
                    {new Intl.DateTimeFormat('fr-CD', { dateStyle: 'full' }).format(new Date(`${group.date}T12:00:00`))}
                  </div>
                  {group.entries.map((entry) => (
                    <article key={`${entry.kind}-${entry.id}`}>
                      <div>
                        <span className="eyebrow">{historyLabels[entry.kind] ?? entry.kind}</span>
                        <strong>{entry.title}</strong>
                        {entry.description && <p>{entry.description}</p>}
                        {entry.signature && (
                          <span className="patient-history-signature">
                            <FileSignature size={14} /> Signé par {entry.signature.doctorName} le{' '}
                            {new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.signature.signedAt))}
                          </span>
                        )}
                      </div>
                      <div className="patient-history-meta">
                        {entry.status && <StatusBadge status={entry.status} />}
                        <span>{entry.department || 'Service non précisé'}</span>
                        <span>{entry.author || 'Auteur non précisé'}</span>
                        <time>{new Intl.DateTimeFormat('fr-CD', { hour: '2-digit', minute: '2-digit' }).format(new Date(entry.date))}</time>
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
