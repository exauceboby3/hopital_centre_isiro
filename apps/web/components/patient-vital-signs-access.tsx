'use client';

import { Activity, HeartPulse, Plus } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import { useAuth } from './auth-provider';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

const emptyVitals = {
  patientId: '',
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

const vitalFields = [
  ['temperatureC', 'Température (°C)'],
  ['weightKg', 'Poids (kg)'],
  ['heightCm', 'Taille (cm)'],
  ['systolic', 'Tension systolique'],
  ['diastolic', 'Tension diastolique'],
  ['pulse', 'Fréquence cardiaque / min'],
  ['respiratoryRate', 'Fréquence respiratoire / min'],
  ['oxygenPercent', 'Saturation O₂ (%)'],
  ['bloodGlucoseMgDl', 'Glycémie (mg/dL)'],
] as const;

export function PatientVitalSignsAccess() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [form, setForm] = useState(emptyVitals);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canRecordVitals = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'NURSE',
  ]);

  useEffect(() => {
    if (!open || patients.length > 0) return;
    setLoadingPatients(true);
    void api<{ items: Patient[] }>('/patients/lookup?limit=100')
      .then((result) => setPatients(result.items))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Liste des patients indisponible.'),
      )
      .finally(() => setLoadingPatients(false));
  }, [open, patients.length]);

  if (pathname !== '/patients' || !canRecordVitals) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.patientId) {
      setError('Sélectionnez le patient.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      const payload = Object.fromEntries(
        Object.entries(form)
          .filter(([key, value]) => key !== 'patientId' && value !== '')
          .map(([key, value]) => [key, key === 'notes' ? value : Number(value)]),
      );
      await api(`/patients/${form.patientId}/vitals`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const patient = patients.find((item) => item.id === form.patientId);
      setNotice(
        `Les signes vitaux de ${patient ? patientName(patient) : 'ce patient'} ont été enregistrés.`,
      );
      setForm(emptyVitals);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signes vitaux impossibles à enregistrer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="panel patient-vital-signs-access">
        <div>
          <span className="eyebrow">Accueil du patient</span>
          <strong>Signes vitaux</strong>
          <p>Enregistrez les constantes directement dans le dossier patient.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => {
            setError('');
            setOpen(true);
          }}
        >
          <HeartPulse size={17} /> Saisir les signes vitaux
        </button>
      </section>
      {notice && <div className="alert success">{notice}</div>}
      {error && !open && <div className="alert error">{error}</div>}

      {open && (
        <Modal title="Signes vitaux du patient" eyebrow="Dossier patient" onClose={() => setOpen(false)}>
          <form onSubmit={submit}>
            {error && <div className="alert error">{error}</div>}
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient"
                value={form.patientId}
                onChange={(patientId) => setForm({ ...form, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
              {loadingPatients && (
                <div className="empty-state full"><Activity className="spin" size={18} /> Chargement des patients…</div>
              )}
              {vitalFields.map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    step="any"
                    value={form[key]}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
              <label className="field full">
                <span>Observations</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || loadingPatients}>
                {submitting ? <Activity className="spin" size={17} /> : <Plus size={17} />}
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
