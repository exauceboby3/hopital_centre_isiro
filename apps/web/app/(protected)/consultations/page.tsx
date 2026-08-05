'use client';

import {
  Activity,
  Clock3,
  FileSignature,
  FlaskConical,
  History,
  ListChecks,
  RotateCcw,
  Stethoscope,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import type { ConsultationPrescription } from '@/components/consultation-structured-prescription';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { ConsultationFormModal } from './consultation-form-modal';
import {
  type BillableService,
  type Consultation,
  type ConsultationFormMode,
  type DoctorAvailability,
  type WaitingAppointment,
  actionLabel,
  consultationMode,
  emptyClinical,
  finalDecisions,
  formatDate,
  successMessage,
  workflowLabel,
} from './consultations.model';

export default function ConsultationsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Consultation[]>([]);
  const [waiting, setWaiting] = useState<WaitingAppointment[]>([]);
  const [laboratoryServices, setLaboratoryServices] = useState<BillableService[]>([]);
  const [hospitalizationServices, setHospitalizationServices] = useState<BillableService[]>([]);
  const [imagingServices, setImagingServices] = useState<BillableService[]>([]);
  const [doctors, setDoctors] = useState<DoctorAvailability[]>([]);
  const [editing, setEditing] = useState<Consultation | null>(null);
  const [editingMode, setEditingMode] = useState<ConsultationFormMode>('INITIAL_ASSESSMENT');
  const [form, setForm] = useState(emptyClinical);
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [hospitalizationServiceId, setHospitalizationServiceId] = useState('');
  const [imagingServiceId, setImagingServiceId] = useState('');
  const [transferDoctorId, setTransferDoctorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [examSearch, setExamSearch] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [focusAppointmentId, setFocusAppointmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const openedFocusRef = useRef('');

  const isDoctor = hasAnyRole(user, ['DOCTOR', 'SURGEON', 'MIDWIFE']);
  const canEdit = hasAnyRole(user, ['DOCTOR', 'SURGEON', 'MIDWIFE', 'ADMIN', 'SUPER_ADMIN']);

  useEffect(() => {
    const appointmentId = new URLSearchParams(window.location.search).get('appointmentId') ?? '';
    setFocusAppointmentId(appointmentId);
  }, []);

  const load = useCallback(
    async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const [consultations, labServices, stayServices, radiologyServices, doctorRows] =
          await Promise.all([
            api<Consultation[]>('/consultations'),
            api<BillableService[]>('/billing/services?type=LABORATORY'),
            api<BillableService[]>('/billing/services?type=HOSPITALIZATION'),
            api<BillableService[]>('/billing/services?type=RADIOLOGY'),
            api<DoctorAvailability[]>('/appointments/doctors/availability'),
          ]);
        const normalizedConsultations = consultations.map((row) => ({
          ...row,
          prescriptions: row.prescriptions ?? [],
          examRequests: row.examRequests ?? [],
          clinicalReport: row.clinicalReport ?? {},
        }));
        setRows(normalizedConsultations);
        setLaboratoryServices(labServices);
        setHospitalizationServices(stayServices);
        setImagingServices(radiologyServices);
        setDoctors(doctorRows);
        setWaiting(isDoctor ? await api<WaitingAppointment[]>('/appointments/waiting-room') : []);
        setError('');
        return normalizedConsultations;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
        return [] as Consultation[];
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [isDoctor],
  );

  useEffect(() => {
    void load(true);
    const timer = window.setInterval(() => void load(false), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const openClinicalForm = useCallback((row: Consultation, forcedMode?: ConsultationFormMode) => {
    const mode = forcedMode ?? consultationMode(row);
    setEditing({ ...row, prescriptions: row.prescriptions ?? [] });
    setEditingMode(mode);
    setForm({
      chiefComplaint: row.clinicalReport?.chiefComplaint ?? row.reason,
      presentIllnessHistory: row.clinicalReport?.presentIllnessHistory ?? '',
      anamnesisComplements: row.clinicalReport?.anamnesisComplements ?? '',
      medicalHistory: row.clinicalReport?.medicalHistory ?? '',
      physicalExamination: row.clinicalReport?.physicalExamination ?? '',
      paraclinicalExams: row.clinicalReport?.paraclinicalExams ?? '',
      diagnosis: row.clinicalReport?.diagnosis ?? '',
      treatmentPlan: row.clinicalReport?.treatmentPlan ?? '',
      laboratoryInterpretation: row.clinicalReport?.laboratoryInterpretation ?? '',
      postLaboratoryDiagnosis: row.clinicalReport?.postLaboratoryDiagnosis ?? '',
      postLaboratoryPlan: row.clinicalReport?.postLaboratoryPlan ?? '',
      postLaboratoryNotes: row.clinicalReport?.postLaboratoryNotes ?? '',
      decision:
        mode === 'POST_LABORATORY' || mode === 'INITIAL_ASSESSMENT'
          ? 'CONTINUE'
          : (row.clinicalReport?.decision ?? 'CONTINUE'),
      amendmentReason: '',
    });
    setSelectedExamIds([]);
    setHospitalizationServiceId('');
    setImagingServiceId('');
    setTransferDoctorId('');
    setTransferReason('');
    setExamSearch('');
    setError('');
  }, []);

  useEffect(() => {
    if (!focusAppointmentId || openedFocusRef.current === focusAppointmentId || loading) return;
    const focused = rows.find((row) => row.appointment?.id === focusAppointmentId);
    if (!focused) return;
    openedFocusRef.current = focusAppointmentId;
    openClinicalForm(focused);
  }, [focusAppointmentId, loading, openClinicalForm, rows]);

  const acknowledge = async (appointment: WaitingAppointment) => {
    setSubmitting(true);
    setError('');
    try {
      const laboratoryReturn = appointment.journeyStage === 'RETURN_TO_DOCTOR';
      await api(`/appointments/${appointment.id}/acknowledge`, { method: 'PATCH' });
      setNotice(
        laboratoryReturn
          ? `Le patient ${patientName(appointment.patient)} est revenu du laboratoire. Interprétez les résultats avant la décision finale.`
          : `Le patient ${patientName(appointment.patient)} est maintenant en consultation.`,
      );
      const consultations = await load(false);
      const consultation = consultations.find((row) => row.appointment?.id === appointment.id);
      if (consultation) {
        openClinicalForm(consultation, laboratoryReturn ? 'POST_LABORATORY' : 'INITIAL_ASSESSMENT');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Prise en charge impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrescriptionCreated = (prescription: ConsultationPrescription) => {
    if (!editing) return;
    const update = (row: Consultation) =>
      row.id === editing.id
        ? { ...row, prescriptions: [prescription, ...(row.prescriptions ?? [])] }
        : row;
    setRows((current) => current.map(update));
    setEditing((current) =>
      current
        ? { ...current, prescriptions: [prescription, ...(current.prescriptions ?? [])] }
        : current,
    );
  };

  const initialAssessmentPayload = () => ({
    chiefComplaint: form.chiefComplaint,
    presentIllnessHistory: form.presentIllnessHistory,
    anamnesisComplements: form.anamnesisComplements,
    medicalHistory: form.medicalHistory,
    physicalExamination: form.physicalExamination,
    diagnosis: form.diagnosis,
    treatmentPlan: form.treatmentPlan,
  });

  const postLaboratoryPayload = () => ({
    laboratoryInterpretation: form.laboratoryInterpretation,
    postLaboratoryDiagnosis: form.postLaboratoryDiagnosis,
    postLaboratoryPlan: form.postLaboratoryPlan,
    postLaboratoryNotes: form.postLaboratoryNotes,
  });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !editing ||
      ['LABORATORY_VIEW', 'HOSPITALIZATION_VIEW', 'READ_ONLY'].includes(editingMode)
    ) {
      return;
    }
    if (form.decision === 'LABORATORY' && !selectedExamIds.length) {
      setError('Sélectionnez au moins un examen de laboratoire.');
      return;
    }
    if (form.decision === 'HOSPITALIZATION' && !hospitalizationServiceId) {
      setError('Sélectionnez le type de séjour à transmettre à l’hospitalisation.');
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
    if (form.decision === 'PRESCRIPTION' && !(editing.prescriptions ?? []).length) {
      setError('Enregistrez l’ordonnance structurée avant de clôturer la consultation.');
      return;
    }
    if (
      editingMode === 'POST_LABORATORY' &&
      ['HOSPITALIZATION', 'PRESCRIPTION', 'FOLLOW_UP'].includes(form.decision) &&
      (!form.laboratoryInterpretation.trim() ||
        !form.postLaboratoryDiagnosis.trim() ||
        !form.postLaboratoryPlan.trim())
    ) {
      setError(
        'Complétez l’interprétation, le diagnostic réévalué et la conduite post-laboratoire.',
      );
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (editingMode === 'INITIAL_ASSESSMENT' && form.decision === 'LABORATORY') {
        // Sauvegarde d’abord l’évaluation, puis crée les examens et verrouille la fiche.
        await api(`/consultations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...initialAssessmentPayload(), decision: 'CONTINUE' }),
        });
        await api('/laboratory/exams/batch', {
          method: 'POST',
          body: JSON.stringify({
            patientId: editing.patient.id,
            consultationId: editing.id,
            serviceIds: selectedExamIds,
            observations: `Indication clinique : ${form.diagnosis || form.chiefComplaint}`,
          }),
        });
        await api(`/consultations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: 'LABORATORY' }),
        });
      } else {
        if (form.decision === 'LABORATORY') {
          await api('/laboratory/exams/batch', {
            method: 'POST',
            body: JSON.stringify({
              patientId: editing.patient.id,
              consultationId: editing.id,
              serviceIds: selectedExamIds,
              observations: `Nouvelle indication : ${
                form.postLaboratoryDiagnosis || form.diagnosis || form.chiefComplaint
              }`,
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
              clinicalIndication:
                form.postLaboratoryDiagnosis || form.diagnosis || form.chiefComplaint,
              priority: 'ROUTINE',
              notes: `Demandé pendant la consultation ${editing.id}`,
            }),
          });
        }
        await api(`/consultations/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...(editingMode === 'INITIAL_ASSESSMENT'
              ? initialAssessmentPayload()
              : postLaboratoryPayload()),
            decision: form.decision,
          }),
        });
      }

      if (form.decision === 'TRANSFER' && editing.appointment) {
        await api(`/appointments/${editing.appointment.id}/transfer`, {
          method: 'PATCH',
          body: JSON.stringify({ doctorId: transferDoctorId, reason: transferReason }),
        });
      }
      setNotice(successMessage(form.decision));
      setEditing(null);
      setFocusAppointmentId('');
      window.history.replaceState({}, '', '/consultations');
      await load(false);
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
      await load(false);
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

  const filteredRows = rows.filter((row) => {
    const focused = !focusAppointmentId || row.appointment?.id === focusAppointmentId;
    const historical =
      row.status === 'COMPLETED' ||
      row.status === 'CANCELLED' ||
      row.appointment?.journeyStage === 'COMPLETED';
    const inScope = focusAppointmentId ? true : scope === 'history' ? historical : !historical;
    return (
      focused &&
      inScope &&
      (!statusFilter ||
        row.status === statusFilter ||
        row.appointment?.journeyStage === statusFilter) &&
      matchesSearch(
        query,
        patientName(row.patient),
        row.patient.medicalRecordNumber,
        patientName(row.doctor),
        row.clinicalReport?.chiefComplaint,
        row.clinicalReport?.diagnosis,
        row.clinicalReport?.postLaboratoryDiagnosis,
        row.orientation,
        row.appointment?.journeyStage,
      )
    );
  });

  const validatedExams = editing?.examRequests.filter((exam) => exam.status === 'VALIDATED') ?? [];
  const activeExams =
    editing?.examRequests.filter((exam) => !['VALIDATED', 'CANCELLED'].includes(exam.status)) ?? [];
  const existingPrescription = editing?.prescriptions?.[0];

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Parcours médical structuré</span>
          <h1>Consultations</h1>
          <p>Évaluation initiale, examens, interprétation distincte et décision médicale.</p>
        </div>
      </div>

      {!focusAppointmentId && (
        <div className="segmented-control" role="tablist" aria-label="Vue des consultations">
          <button className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>
            <Stethoscope size={17} /> Consultations actives
          </button>
          <button
            className={scope === 'history' ? 'active' : ''}
            onClick={() => setScope('history')}
          >
            <History size={17} /> Historique
          </button>
        </div>
      )}

      {focusAppointmentId && (
        <div className="alert info">
          Seul le patient que vous venez de recevoir est affiché. Fermez sa fiche pour revenir à la
          liste active.
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      {isDoctor && waiting.length > 0 && !focusAppointmentId && (
        <section className="panel waiting-room-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">File médicale</span>
              <h2>Nouveaux patients et retours du laboratoire</h2>
            </div>
            <Stethoscope size={22} />
          </div>
          <div className="waiting-patient-grid">
            {waiting.map((appointment) => {
              const laboratoryReturn = appointment.journeyStage === 'RETURN_TO_DOCTOR';
              return (
                <article
                  className={`waiting-patient-card ${laboratoryReturn ? 'laboratory-return' : ''}`}
                  key={appointment.id}
                >
                  <div>
                    <strong>{patientName(appointment.patient)}</strong>
                    <span>{appointment.patient.medicalRecordNumber}</span>
                    <small className="waiting-patient-kind">
                      {laboratoryReturn ? (
                        <>
                          <RotateCcw size={13} /> Résultats laboratoire prêts
                        </>
                      ) : (
                        <>
                          <Clock3 size={13} /> Nouveau patient
                        </>
                      )}
                    </small>
                  </div>
                  <time>{formatDate(appointment.scheduledAt)}</time>
                  <button
                    className="primary-button"
                    disabled={submitting}
                    onClick={() => void acknowledge(appointment)}
                  >
                    <Stethoscope size={16} />
                    {laboratoryReturn ? 'Reprendre et interpréter' : 'Prendre en charge'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Patient, dossier, diagnostic, étape ou orientation…"
          status={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={
            scope === 'active'
              ? [
                  { value: 'WAITING', label: 'En attente labo / imagerie' },
                  { value: 'IN_PROGRESS', label: 'Chez le médecin' },
                  { value: 'LABORATORY', label: 'Au laboratoire' },
                  { value: 'RETURN_TO_DOCTOR', label: 'Retour médecin' },
                  { value: 'HOSPITALIZATION', label: 'Vers hospitalisation' },
                ]
              : [
                  { value: 'COMPLETED', label: 'Terminée' },
                  { value: 'CANCELLED', label: 'Annulée' },
                ]
          }
          resultCount={filteredRows.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient</th>
                <th>Médecin</th>
                <th>Diagnostic</th>
                <th>Étape actuelle</th>
                <th>Statut</th>
                <th>Examens</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Activity className="spin" /> Chargement…
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <ListChecks />
                      <strong>
                        {scope === 'active'
                          ? 'Aucune consultation active attribuée'
                          : 'Aucune consultation dans l’historique'}
                      </strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const decision = row.clinicalReport?.decision;
                  const canSign =
                    isDoctor &&
                    !row.signature &&
                    row.status === 'COMPLETED' &&
                    Boolean(decision && finalDecisions.has(decision));
                  const requiresMedicalAcknowledgement = [
                    'WAITING_DOCTOR',
                    'RETURN_TO_DOCTOR',
                  ].includes(row.appointment?.journeyStage ?? '');
                  const validResults = row.examRequests.filter(
                    (exam) => exam.status === 'VALIDATED',
                  ).length;
                  const pendingResults = row.examRequests.filter(
                    (exam) => !['VALIDATED', 'CANCELLED'].includes(exam.status),
                  ).length;
                  return (
                    <tr key={row.id}>
                      <td>{formatDate(row.startedAt ?? row.createdAt)}</td>
                      <td>
                        <strong>{patientName(row.patient)}</strong>
                        <br />
                        <span className="muted">{row.patient.medicalRecordNumber}</span>
                      </td>
                      <td>
                        {patientName(row.doctor)}
                        <br />
                        <span className="muted">{row.doctor.specialty}</span>
                      </td>
                      <td>
                        {row.clinicalReport?.postLaboratoryDiagnosis ||
                          row.clinicalReport?.diagnosis ||
                          'À compléter'}
                      </td>
                      <td>
                        <span className="consultation-stage-label">{workflowLabel(row)}</span>
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                        {row.signature && (
                          <>
                            <br />
                            <small className="signed-record">
                              <FileSignature size={13} /> Signé
                            </small>
                          </>
                        )}
                      </td>
                      <td>
                        {row.examRequests.length ? (
                          <span className="exam-count-summary">
                            <FlaskConical size={13} /> {validResults} prêt(s) · {pendingResults} en
                            cours
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {canEdit && !requiresMedicalAcknowledgement && (
                            <button className="text-button" onClick={() => openClinicalForm(row)}>
                              <Stethoscope size={15} /> {actionLabel(row)}
                            </button>
                          )}
                          {canEdit && requiresMedicalAcknowledgement && (
                            <span className="muted consultation-temporary-lock">
                              <RotateCcw size={14} /> Reprendre depuis la file médicale
                            </span>
                          )}
                          {canSign && (
                            <button
                              className="text-button"
                              disabled={submitting}
                              onClick={() => void sign(row)}
                            >
                              <FileSignature size={15} /> Signer
                            </button>
                          )}
                          <CustomFieldsEditor entity="CONSULTATION" entityId={row.id} />
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

      {editing && (
        <ConsultationFormModal
          editing={editing}
          mode={editingMode}
          form={form}
          setForm={setForm}
          onSubmit={save}
          onClose={() => {
            setEditing(null);
            if (focusAppointmentId) {
              setFocusAppointmentId('');
              window.history.replaceState({}, '', '/consultations');
            }
          }}
          submitting={submitting}
          activeExams={activeExams}
          validatedExams={validatedExams}
          examSearch={examSearch}
          setExamSearch={setExamSearch}
          groupedLabServices={groupedLabServices}
          selectedExamIds={selectedExamIds}
          setSelectedExamIds={setSelectedExamIds}
          imagingServiceId={imagingServiceId}
          setImagingServiceId={setImagingServiceId}
          imagingServices={imagingServices}
          hospitalizationServiceId={hospitalizationServiceId}
          setHospitalizationServiceId={setHospitalizationServiceId}
          hospitalizationServices={hospitalizationServices}
          transferDoctorId={transferDoctorId}
          setTransferDoctorId={setTransferDoctorId}
          doctors={doctors}
          transferReason={transferReason}
          setTransferReason={setTransferReason}
          existingPrescription={existingPrescription}
          onPrescriptionCreated={handlePrescriptionCreated}
        />
      )}
    </>
  );
}
