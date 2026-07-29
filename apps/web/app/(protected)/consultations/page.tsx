'use client';

import {
  Activity,
  FileSignature,
  FlaskConical,
  HeartPulse,
  ListChecks,
  Save,
  Stethoscope,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

type ConsultationDecision =
  | 'CONTINUE'
  | 'LABORATORY'
  | 'IMAGING'
  | 'HOSPITALIZATION'
  | 'TRANSFER'
  | 'PRESCRIPTION'
  | 'DISCHARGE'
  | 'COMPLETE';

interface ClinicalReport {
  chiefComplaint?: string;
  presentIllnessHistory?: string;
  anamnesisComplements?: string;
  medicalHistory?: string;
  physicalExamination?: string;
  paraclinicalExams?: string;
  diagnosis?: string;
  treatmentPlan?: string;
  decision?: ConsultationDecision;
  amendmentReason?: string;
}
interface MedicalSignature {
  doctorName: string;
  licenseNumber?: string;
  signedAt: string;
  hash: string;
}
interface Consultation {
  id: string;
  status: string;
  reason: string;
  orientation?: string;
  prescription?: string;
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
  examRequests: Array<{
    id: string;
    type: string;
    status: string;
    result?: string;
    careAuthorization?: { status: string; invoice: { number: string; status: string } };
  }>;
}
interface WaitingAppointment {
  id: string;
  scheduledAt: string;
  patient: Patient;
  consultation?: { id: string; status: string };
  doctor?: { lastName: string; postName?: string; firstName?: string };
}
interface BillableService {
  id: string;
  code: string;
  name: string;
  category?: string;
  price: string;
}
interface DoctorAvailability {
  id: string;
  name: string;
  specialty: string;
  availability: string;
}

const emptyClinical = {
  chiefComplaint: '',
  presentIllnessHistory: '',
  anamnesisComplements: '',
  medicalHistory: '',
  physicalExamination: '',
  paraclinicalExams: '',
  diagnosis: '',
  treatmentPlan: '',
  decision: 'CONTINUE' as ConsultationDecision,
  prescription: '',
  amendmentReason: '',
};

const decisionOptions: Array<{ value: ConsultationDecision; label: string }> = [
  { value: 'CONTINUE', label: 'Poursuivre la consultation' },
  { value: 'LABORATORY', label: 'Envoyer au laboratoire' },
  { value: 'IMAGING', label: 'Envoyer en imagerie' },
  { value: 'HOSPITALIZATION', label: 'Orienter vers hospitalisation' },
  { value: 'TRANSFER', label: 'Transférer à un autre médecin' },
  { value: 'PRESCRIPTION', label: 'Prescrire et terminer' },
  { value: 'DISCHARGE', label: 'Libérer le patient' },
  { value: 'COMPLETE', label: 'Terminer la consultation' },
];

export default function ConsultationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Consultation[]>([]);
  const [waiting, setWaiting] = useState<WaitingAppointment[]>([]);
  const [laboratoryServices, setLaboratoryServices] = useState<BillableService[]>([]);
  const [hospitalizationServices, setHospitalizationServices] = useState<BillableService[]>([]);
  const [imagingServices, setImagingServices] = useState<BillableService[]>([]);
  const [doctors, setDoctors] = useState<DoctorAvailability[]>([]);
  const [editing, setEditing] = useState<Consultation | null>(null);
  const [form, setForm] = useState(emptyClinical);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [hospitalizationServiceId, setHospitalizationServiceId] = useState('');
  const [imagingServiceId, setImagingServiceId] = useState('');
  const [transferDoctorId, setTransferDoctorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isDoctor = hasAnyRole(user, ['DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canEdit = hasAnyRole(user, ['DOCTOR', 'SURGEON', 'MIDWIFE', 'ADMIN', 'SUPER_ADMIN']);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [consultations, labServices, stayServices, radiologyServices, doctorRows] =
        await Promise.all([
          api<Consultation[]>('/consultations'),
          api<BillableService[]>('/billing/services?type=LABORATORY'),
          api<BillableService[]>('/billing/services?type=HOSPITALIZATION'),
          api<BillableService[]>('/billing/services?type=RADIOLOGY'),
          api<DoctorAvailability[]>('/appointments/doctors/availability'),
        ]);
      setRows(consultations);
      setLaboratoryServices(labServices);
      setHospitalizationServices(stayServices);
      setImagingServices(radiologyServices);
      setDoctors(doctorRows);
      if (isDoctor) setWaiting(await api<WaitingAppointment[]>('/appointments/waiting-room'));
      else setWaiting([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [isDoctor]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const acknowledge = async (appointment: WaitingAppointment) => {
    setSubmitting(true);
    setError('');
    try {
      await api(`/appointments/${appointment.id}/acknowledge`, { method: 'PATCH' });
      setNotice(`Le patient ${patientName(appointment.patient)} est maintenant en consultation.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Prise en charge impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const openClinicalForm = (row: Consultation) => {
    setEditing(row);
    setForm({
      chiefComplaint: row.clinicalReport?.chiefComplaint ?? row.reason,
      presentIllnessHistory: row.clinicalReport?.presentIllnessHistory ?? '',
      anamnesisComplements: row.clinicalReport?.anamnesisComplements ?? '',
      medicalHistory: row.clinicalReport?.medicalHistory ?? '',
      physicalExamination: row.clinicalReport?.physicalExamination ?? '',
      paraclinicalExams: row.clinicalReport?.paraclinicalExams ?? '',
      diagnosis: row.clinicalReport?.diagnosis ?? '',
      treatmentPlan: row.clinicalReport?.treatmentPlan ?? '',
      decision: row.clinicalReport?.decision ?? 'CONTINUE',
      prescription: row.prescription ?? '',
      amendmentReason: '',
    });
    setSelectedExamIds([]);
    setHospitalizationServiceId('');
    setImagingServiceId('');
    setTransferDoctorId('');
    setTransferReason('');
    setExamSearch('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (editing.signature && form.amendmentReason.trim().length < 5) {
      setError('Indiquez la raison de la correction du dossier signé.');
      return;
    }
    if (form.decision === 'LABORATORY' && !selectedExamIds.length && !editing.examRequests.length) {
      setError('Sélectionnez au moins un examen de laboratoire.');
      return;
    }
    if (form.decision === 'HOSPITALIZATION' && !hospitalizationServiceId) {
      setError("Sélectionnez le tarif préalable d'hospitalisation.");
      return;
    }
    if (form.decision === 'IMAGING' && !imagingServiceId) {
      setError('Sélectionnez l’examen d’imagerie à demander.');
      return;
    }
    if (form.decision === 'TRANSFER' && (!transferDoctorId || transferReason.trim().length < 5)) {
      setError('Sélectionnez le médecin destinataire et précisez le motif du transfert.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api(`/consultations/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          chiefComplaint: form.chiefComplaint,
          presentIllnessHistory: form.presentIllnessHistory,
          anamnesisComplements: form.anamnesisComplements,
          medicalHistory: form.medicalHistory,
          physicalExamination: form.physicalExamination,
          paraclinicalExams: form.paraclinicalExams,
          diagnosis: form.diagnosis,
          treatmentPlan: form.treatmentPlan,
          decision: form.decision,
          prescription: form.prescription || undefined,
          amendmentReason: form.amendmentReason || undefined,
        }),
      });

      if (form.decision === 'LABORATORY' && selectedExamIds.length) {
        await api('/laboratory/exams/batch', {
          method: 'POST',
          body: JSON.stringify({
            patientId: editing.patient.id,
            consultationId: editing.id,
            serviceIds: selectedExamIds,
            observations: `Indication clinique : ${form.diagnosis || form.chiefComplaint}`,
          }),
        });
      }
      if (form.decision === 'HOSPITALIZATION') {
        await api(`/consultations/${editing.id}/hospitalization-referral`, {
          method: 'POST',
          body: JSON.stringify({ serviceId: hospitalizationServiceId }),
        });
      }
      if (form.decision === 'IMAGING') {
        await api('/operations/clinical-orders', {
          method: 'POST',
          body: JSON.stringify({
            patientId: editing.patient.id,
            serviceId: imagingServiceId,
            clinicalIndication: form.diagnosis || form.chiefComplaint,
            priority: 'ROUTINE',
            notes: `Demandé pendant la consultation ${editing.id}`,
          }),
        });
      }
      if (form.decision === 'TRANSFER' && editing.appointment) {
        await api(`/appointments/${editing.appointment.id}/transfer`, {
          method: 'PATCH',
          body: JSON.stringify({ doctorId: transferDoctorId, reason: transferReason }),
        });
      }
      setNotice('La fiche médicale et la décision clinique ont été enregistrées.');
      setEditing(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const sign = async (row: Consultation) => {
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api(`/consultations/${row.id}/sign`, {
        method: 'PATCH',
        body: JSON.stringify({ confirmation: 'Dossier relu et validé par le médecin.' }),
      });
      setNotice(`La consultation de ${patientName(row.patient)} a été signée et verrouillée.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Signature impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const groupedLabServices = useMemo(() => {
    const term = examSearch.trim().toLocaleLowerCase('fr');
    return laboratoryServices
      .filter((service) =>
        term
          ? `${service.code} ${service.name} ${service.category ?? ''}`
              .toLocaleLowerCase('fr')
              .includes(term)
          : true,
      )
      .reduce<Record<string, BillableService[]>>((groups, service) => {
        (groups[service.category || 'Autres examens'] ??= []).push(service);
        return groups;
      }, {});
  }, [examSearch, laboratoryServices]);

  const filteredRows = rows.filter(
    (row) =>
      (!statusFilter || row.status === statusFilter) &&
      matchesSearch(
        query,
        patientName(row.patient),
        row.patient.medicalRecordNumber,
        patientName(row.doctor),
        row.clinicalReport?.chiefComplaint,
        row.clinicalReport?.diagnosis,
        row.orientation,
      ),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Dossier clinique attribué</span>
          <h1>Consultations</h1>
          <p>Le médecin ouvre uniquement les patients affectés par la réception.</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      {isDoctor && waiting.length > 0 && (
        <section className="panel waiting-room-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Salle d’attente</span>
              <h2>Patients prêts et paiement validé</h2>
            </div>
            <Stethoscope size={22} />
          </div>
          <div className="waiting-patient-grid">
            {waiting.map((appointment) => (
              <article className="waiting-patient-card" key={appointment.id}>
                <div>
                  <strong>{patientName(appointment.patient)}</strong>
                  <span>{appointment.patient.medicalRecordNumber}</span>
                </div>
                <time>
                  {new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(
                    new Date(appointment.scheduledAt),
                  )}
                </time>
                <button
                  className="primary-button"
                  disabled={submitting}
                  onClick={() => void acknowledge(appointment)}
                >
                  <Stethoscope size={16} /> Prendre en charge
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Patient, dossier, diagnostic ou orientation…"
          status={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={[
            { value: 'WAITING', label: 'En attente' },
            { value: 'IN_PROGRESS', label: 'En cours' },
            { value: 'COMPLETED', label: 'Terminée' },
            { value: 'CANCELLED', label: 'Annulée' },
          ]}
          resultCount={filteredRows.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Médecin</th>
                <th>Plainte principale</th>
                <th>Diagnostic</th>
                <th>Décision</th>
                <th>Statut</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state"><Activity className="spin" /> Chargement…</div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state"><ListChecks /><strong>Aucune consultation attribuée</strong></div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.startedAt ?? row.createdAt))}</td>
                    <td><strong>{patientName(row.patient)}</strong><br /><span className="muted">{row.patient.medicalRecordNumber}</span></td>
                    <td>{patientName(row.doctor)}<br /><span className="muted">{row.doctor.specialty}</span></td>
                    <td>{row.clinicalReport?.chiefComplaint ?? row.reason}</td>
                    <td>{row.clinicalReport?.diagnosis || '—'}</td>
                    <td>{decisionOptions.find((option) => option.value === row.clinicalReport?.decision)?.label ?? row.orientation ?? '—'}</td>
                    <td><StatusBadge status={row.status} />{row.signature && <><br /><small className="signed-record"><FileSignature size={13} /> Signé</small></>}</td>
                    <td>
                      <div className="row-actions">
                        {canEdit && <button className="text-button" onClick={() => openClinicalForm(row)}><Stethoscope size={15} /> Ouvrir la fiche</button>}
                        {isDoctor && !row.signature && row.clinicalReport?.decision && (
                          <button className="text-button" disabled={submitting} onClick={() => void sign(row)}><FileSignature size={15} /> Signer</button>
                        )}
                        {row.examRequests.length > 0 && <span className="muted"><FlaskConical size={13} /> {row.examRequests.length} examen(s)</span>}
                        <CustomFieldsEditor entity="CONSULTATION" entityId={row.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <Modal
          wide
          title={`Consultation · ${patientName(editing.patient)}`}
          eyebrow={`${editing.patient.medicalRecordNumber} · ${patientName(editing.doctor)}`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={save} className="clinical-consultation-form">
            {editing.signature && (
              <div className="alert warning">
                <FileSignature size={18} />
                Dossier signé le {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(editing.signature.signedAt))} par {editing.signature.doctorName}. Toute correction devient un amendement tracé et devra être resignée.
              </div>
            )}
            {editing.vitalSigns[0] && (
              <div className="clinical-vitals-strip">
                <HeartPulse size={18} />
                <span>Temp. {editing.vitalSigns[0].temperatureC ?? '—'} °C</span>
                <span>TA {editing.vitalSigns[0].systolic ?? '—'}/{editing.vitalSigns[0].diastolic ?? '—'}</span>
                <span>FC {editing.vitalSigns[0].pulse ?? '—'}/min</span>
                <span>FR {editing.vitalSigns[0].respiratoryRate ?? '—'}/min</span>
                <span>SpO₂ {editing.vitalSigns[0].oxygenPercent ?? '—'}%</span>
                <span>Glycémie {editing.vitalSigns[0].bloodGlucoseMgDl ?? '—'} mg/dL</span>
              </div>
            )}

            <section className="clinical-form-section">
              <div className="section-title"><span>1</span><div><strong>Motif et anamnèse</strong><small>Partie strictement médicale</small></div></div>
              <div className="form-grid">
                <label className="field full"><span>Plainte principale *</span><textarea required rows={2} value={form.chiefComplaint} onChange={(event) => setForm({ ...form, chiefComplaint: event.target.value })} /></label>
                <label className="field full"><span>Histoire de la maladie actuelle *</span><textarea required rows={4} value={form.presentIllnessHistory} onChange={(event) => setForm({ ...form, presentIllnessHistory: event.target.value })} /></label>
                <label className="field full"><span>Compléments d’anamnèse</span><textarea rows={3} value={form.anamnesisComplements} onChange={(event) => setForm({ ...form, anamnesisComplements: event.target.value })} /></label>
                <label className="field full"><span>Antécédents médicaux, chirurgicaux, familiaux et allergies</span><textarea rows={4} value={form.medicalHistory} onChange={(event) => setForm({ ...form, medicalHistory: event.target.value })} /></label>
              </div>
            </section>

            <section className="clinical-form-section">
              <div className="section-title"><span>2</span><div><strong>Examen et synthèse</strong><small>Constatations du médecin</small></div></div>
              <div className="form-grid">
                <label className="field full"><span>Examen physique *</span><textarea required rows={5} value={form.physicalExamination} onChange={(event) => setForm({ ...form, physicalExamination: event.target.value })} /></label>
                <label className="field full"><span>Examens paracliniques disponibles</span><textarea rows={3} value={form.paraclinicalExams} onChange={(event) => setForm({ ...form, paraclinicalExams: event.target.value })} /></label>
                <label className="field full"><span>Diagnostic / hypothèses diagnostiques *</span><textarea required rows={3} value={form.diagnosis} onChange={(event) => setForm({ ...form, diagnosis: event.target.value })} /></label>
                <label className="field full"><span>Conduite thérapeutique *</span><textarea required rows={4} value={form.treatmentPlan} onChange={(event) => setForm({ ...form, treatmentPlan: event.target.value })} /></label>
                <label className="field full"><span>Prescription structurée / instructions</span><textarea rows={3} value={form.prescription} onChange={(event) => setForm({ ...form, prescription: event.target.value })} /></label>
              </div>
            </section>

            <section className="clinical-form-section">
              <div className="section-title"><span>3</span><div><strong>Décision de fin de consultation</strong><small>Le patient reste actif tant qu’aucune décision n’est enregistrée</small></div></div>
              <label className="field full"><span>Action clinique *</span><select required value={form.decision} onChange={(event) => setForm({ ...form, decision: event.target.value as ConsultationDecision })}>{decisionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>

              {form.decision === 'LABORATORY' && (
                <div className="clinical-decision-panel">
                  <label className="field full"><span>Rechercher un examen</span><input value={examSearch} onChange={(event) => setExamSearch(event.target.value)} placeholder="NFS, glycémie, paludisme…" /></label>
                  <div className="exam-catalog-groups">
                    {Object.entries(groupedLabServices).map(([category, services]) => (
                      <fieldset key={category}><legend>{category}</legend>{services.map((service) => <label className="check-row" key={service.id}><input type="checkbox" checked={selectedExamIds.includes(service.id)} onChange={(event) => setSelectedExamIds((current) => event.target.checked ? [...current, service.id] : current.filter((id) => id !== service.id))} /><span>{service.name}</span></label>)}</fieldset>
                    ))}
                  </div>
                </div>
              )}

              {form.decision === 'IMAGING' && (
                <SearchableSelect className="full" required label="Examen d’imagerie" value={imagingServiceId} onChange={setImagingServiceId} options={imagingServices.map((service) => ({ value: service.id, label: service.name, description: service.category }))} />
              )}

              {form.decision === 'HOSPITALIZATION' && (
                <SearchableSelect className="full" required label="Tarif préalable d’hospitalisation" value={hospitalizationServiceId} onChange={setHospitalizationServiceId} options={hospitalizationServices.map((service) => ({ value: service.id, label: service.name }))} />
              )}

              {form.decision === 'TRANSFER' && (
                <div className="form-grid clinical-decision-panel">
                  <SearchableSelect className="full" required label="Médecin destinataire" value={transferDoctorId} onChange={setTransferDoctorId} options={doctors.filter((doctor) => doctor.id !== editing.doctor.id).map((doctor) => ({ value: doctor.id, label: doctor.name, description: `${doctor.specialty} · ${doctor.availability}` }))} />
                  <label className="field full"><span>Motif du transfert *</span><textarea required minLength={5} rows={3} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} /></label>
                </div>
              )}
            </section>

            {editing.signature && (
              <label className="field full"><span>Raison de l’amendement *</span><textarea required minLength={5} rows={2} value={form.amendmentReason} onChange={(event) => setForm({ ...form, amendmentReason: event.target.value })} /></label>
            )}

            <div className="modal-actions clinical-actions">
              <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Fermer</button>
              <button className="primary-button" disabled={submitting}><Save size={17} /> Enregistrer la fiche et la décision</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
