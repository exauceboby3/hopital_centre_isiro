'use client';

import {
  Activity,
  ArrowRightLeft,
  BedDouble,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileSignature,
  FlaskConical,
  HeartPulse,
  LockKeyhole,
  Pill,
  Save,
  ScanLine,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type FormEventHandler,
  type SetStateAction,
} from 'react';
import {
  ConsultationStructuredPrescription,
  type ConsultationPrescription,
} from '@/components/consultation-structured-prescription';
import { Modal } from '@/components/modal';
import { SearchableMultiSelect, SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { patientName } from '@/lib/display';
import {
  type BillableService,
  type ClinicalForm,
  type Consultation,
  type ConsultationDecision,
  type ConsultationExam,
  type ConsultationFormMode,
  type DoctorAvailability,
  type Icd10Catalog,
  bodySystems,
  decisionGuidance,
  decisionOptions,
  formatBodySystems,
  formatDiagnoses,
  formatDate,
  icd10DisplayLabel,
  initialDecisionOptions,
  parseBodySystems,
  parseDiagnoses,
  parseDiagnosisCodes,
  resultValues,
  saveLabel,
  workflowLabel,
} from './consultations.model';

interface ConsultationFormModalProps {
  editing: Consultation;
  mode: ConsultationFormMode;
  form: ClinicalForm;
  setForm: Dispatch<SetStateAction<ClinicalForm>>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClose: () => void;
  submitting: boolean;
  activeExams: ConsultationExam[];
  validatedExams: ConsultationExam[];
  examSearch: string;
  setExamSearch: Dispatch<SetStateAction<string>>;
  groupedLabServices: Record<string, BillableService[]>;
  selectedExamIds: string[];
  setSelectedExamIds: Dispatch<SetStateAction<string[]>>;
  imagingServiceId: string;
  setImagingServiceId: Dispatch<SetStateAction<string>>;
  imagingServices: BillableService[];
  hospitalizationServiceId: string;
  setHospitalizationServiceId: Dispatch<SetStateAction<string>>;
  hospitalizationServices: BillableService[];
  transferDoctorId: string;
  setTransferDoctorId: Dispatch<SetStateAction<string>>;
  doctors: DoctorAvailability[];
  transferReason: string;
  setTransferReason: Dispatch<SetStateAction<string>>;
  existingPrescription?: ConsultationPrescription;
  onPrescriptionCreated: (prescription: ConsultationPrescription) => void;
}

const decisionIcon: Partial<Record<ConsultationDecision, typeof Pill>> = {
  PRESCRIPTION: Pill,
  HOSPITALIZATION: BedDouble,
  LABORATORY: FlaskConical,
  IMAGING: ScanLine,
  TRANSFER: ArrowRightLeft,
  FOLLOW_UP: CalendarCheck2,
  CONTINUE: Save,
};

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="field full consultation-readonly-field">
      <span>{label}</span>
      <p>{value?.trim() || 'Non renseigné'}</p>
    </div>
  );
}

function ReadOnlyDiagnoses({ value }: { value?: string }) {
  const diagnoses = parseDiagnoses(value);
  if (!diagnoses.length)
    return <ReadOnlyField label="Hypothèses diagnostiques CIM-10" value={value} />;
  return (
    <div className="field full consultation-readonly-field consultation-diagnosis-table">
      <span>Hypothèses diagnostiques CIM-10</span>
      <div className="table-scroll">
        <table className="compact-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Diagnostic</th>
            </tr>
          </thead>
          <tbody>
            {diagnoses.map((diagnosis) => (
              <tr key={diagnosis.code}>
                <td>
                  <strong>{diagnosis.code}</strong>
                </td>
                <td>{diagnosis.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ConsultationFormModal({
  editing,
  mode,
  form,
  setForm,
  onSubmit,
  onClose,
  submitting,
  activeExams,
  validatedExams,
  examSearch,
  setExamSearch,
  groupedLabServices,
  selectedExamIds,
  setSelectedExamIds,
  imagingServiceId,
  setImagingServiceId,
  imagingServices,
  hospitalizationServiceId,
  setHospitalizationServiceId,
  hospitalizationServices,
  transferDoctorId,
  setTransferDoctorId,
  doctors,
  transferReason,
  setTransferReason,
  existingPrescription,
  onPrescriptionCreated,
}: ConsultationFormModalProps) {
  const [diagnosisCatalog, setDiagnosisCatalog] = useState<Icd10Catalog['rows']>([]);
  const [diagnosisCatalogError, setDiagnosisCatalogError] = useState('');
  const [diagnosisCatalogLoading, setDiagnosisCatalogLoading] = useState(true);
  const initialLocked = mode !== 'INITIAL_ASSESSMENT';
  const postLaboratory = mode === 'POST_LABORATORY';
  const readOnly = ['LABORATORY_VIEW', 'HOSPITALIZATION_VIEW', 'READ_ONLY'].includes(mode);
  const availableDecisions = postLaboratory
    ? [
        {
          value: 'CONTINUE' as ConsultationDecision,
          label: 'Enregistrer l’interprétation',
          detail: 'Conserver le dossier actif avant de choisir la décision finale.',
        },
        ...decisionOptions,
      ]
    : initialDecisionOptions;
  const guidance = decisionGuidance[form.decision];
  const modalTitle =
    mode === 'POST_LABORATORY'
      ? `Interprétation des résultats · ${patientName(editing.patient)}`
      : mode === 'LABORATORY_VIEW'
        ? `Passage au laboratoire · ${patientName(editing.patient)}`
        : mode === 'HOSPITALIZATION_VIEW'
          ? `Orientation hospitalière · ${patientName(editing.patient)}`
          : mode === 'READ_ONLY'
            ? `Dossier médical · ${patientName(editing.patient)}`
            : `Évaluation initiale · ${patientName(editing.patient)}`;
  const bodySystemOptions = useMemo(
    () => bodySystems.map((system) => ({ value: system, label: system })),
    [],
  );
  const diagnosisOptions = useMemo(
    () =>
      diagnosisCatalog.map((row) => ({
        value: row[0],
        label: `${row[0]} · ${icd10DisplayLabel(row)}`,
        shortLabel: row[0],
        description: row[3],
      })),
    [diagnosisCatalog],
  );
  const selectedChiefComplaintSystems = parseBodySystems(form.chiefComplaint);
  const selectedAnamnesisSystems = parseBodySystems(form.anamnesisComplements);
  const selectedDiagnosisCodes = parseDiagnosisCodes(form.diagnosis);
  const legacyAnamnesis =
    form.anamnesisComplements.trim() && !selectedAnamnesisSystems.length
      ? form.anamnesisComplements.trim()
      : '';
  const legacyDiagnosis =
    form.diagnosis.trim() && !selectedDiagnosisCodes.length ? form.diagnosis.trim() : '';

  useEffect(() => {
    if (mode !== 'INITIAL_ASSESSMENT') return;
    const controller = new AbortController();
    setDiagnosisCatalogLoading(true);
    fetch('/data/cim-10-fr-2025.json', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Référentiel CIM-10 indisponible.');
        const catalog = (await response.json()) as Icd10Catalog;
        if (!Array.isArray(catalog.rows) || !catalog.rows.length) {
          throw new Error('Référentiel CIM-10 vide ou invalide.');
        }
        setDiagnosisCatalog(catalog.rows);
        setDiagnosisCatalogError('');
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setDiagnosisCatalogError(
          reason instanceof Error ? reason.message : 'Référentiel CIM-10 indisponible.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setDiagnosisCatalogLoading(false);
      });
    return () => controller.abort();
  }, [mode]);

  return (
    <Modal
      wide
      title={modalTitle}
      eyebrow={`${editing.patient.medicalRecordNumber} · ${patientName(editing.doctor)}`}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="clinical-consultation-form">
        <div
          className={`consultation-workflow-state stage-${(
            editing.appointment?.journeyStage ?? 'IN_CONSULTATION'
          ).toLowerCase()}`}
        >
          <div>
            <strong>{workflowLabel(editing)}</strong>
            <span>
              {mode === 'LABORATORY_VIEW'
                ? 'Le patient est temporairement au laboratoire. L’évaluation initiale est verrouillée et le médecin reste disponible.'
                : mode === 'POST_LABORATORY'
                  ? 'Les données d’avant laboratoire sont conservées. Ajoutez uniquement l’interprétation et la conduite après résultats.'
                  : mode === 'HOSPITALIZATION_VIEW'
                    ? 'L’indication médicale a été transmise. L’admission et la sortie administrative sont gérées hors de cette fiche.'
                    : mode === 'READ_ONLY'
                      ? 'Ce dossier est terminé et présenté en lecture seule.'
                      : 'Complétez l’évaluation clinique avant de choisir la prochaine étape.'}
            </span>
          </div>
          <StatusBadge status={editing.status} />
        </div>

        {editing.signature && (
          <div className="alert warning">
            <FileSignature size={18} />
            Dossier signé le {formatDate(editing.signature.signedAt)} par{' '}
            {editing.signature.doctorName}. Il est présenté en lecture seule.
          </div>
        )}

        {editing.vitalSigns[0] && (
          <div className="clinical-vitals-strip">
            <HeartPulse size={18} />
            <span>Temp. {editing.vitalSigns[0].temperatureC ?? '—'} °C</span>
            <span>
              TA {editing.vitalSigns[0].systolic ?? '—'}/{editing.vitalSigns[0].diastolic ?? '—'}
            </span>
            <span>FC {editing.vitalSigns[0].pulse ?? '—'}/min</span>
            <span>FR {editing.vitalSigns[0].respiratoryRate ?? '—'}/min</span>
            <span>SpO₂ {editing.vitalSigns[0].oxygenPercent ?? '—'}%</span>
            <span>Glycémie {editing.vitalSigns[0].bloodGlucoseMgDl ?? '—'} mg/dL</span>
          </div>
        )}

        <div className="clinical-appointment-context">
          <strong>Motif transmis lors du rendez-vous</strong>
          <span>{editing.reason || 'Aucun motif renseigné à l’accueil.'}</span>
        </div>

        <section className="clinical-form-section">
          <div className="section-title">
            <span>{initialLocked ? <LockKeyhole size={16} /> : '1'}</span>
            <div>
              <strong>Évaluation clinique initiale</strong>
              <small>
                {initialLocked
                  ? 'Données figées depuis l’envoi au laboratoire'
                  : 'Motif, anamnèse, examen et hypothèses avant examens complémentaires'}
              </small>
            </div>
          </div>

          {initialLocked ? (
            <div className="form-grid">
              <ReadOnlyField
                label="Systèmes concernés par la plainte principale"
                value={form.chiefComplaint}
              />
              <ReadOnlyField
                label="Histoire de la maladie actuelle"
                value={form.presentIllnessHistory}
              />
              <ReadOnlyField
                label="Systèmes explorés dans l’anamnèse"
                value={form.anamnesisComplements}
              />
              <ReadOnlyField
                label="Antécédents, interventions, histoire familiale et allergies"
                value={form.medicalHistory}
              />
              <ReadOnlyField label="Examen physique initial" value={form.physicalExamination} />
              <ReadOnlyDiagnoses value={form.diagnosis} />
              <ReadOnlyField label="Conduite initiale" value={form.treatmentPlan} />
            </div>
          ) : (
            <div className="form-grid">
              <SearchableMultiSelect
                className="full"
                required
                label="Systèmes concernés par la plainte principale"
                values={selectedChiefComplaintSystems}
                options={bodySystemOptions}
                onChange={(values) =>
                  setForm({ ...form, chiefComplaint: formatBodySystems(values) })
                }
                placeholder="Rechercher un système puis le cocher…"
                helpText="Sélectionnez tous les systèmes concernés ; aucune saisie libre n’est nécessaire."
              />
              <label className="field full">
                <span>Histoire de la maladie actuelle*</span>
                <textarea
                  required
                  rows={4}
                  value={form.presentIllnessHistory}
                  onChange={(event) =>
                    setForm({ ...form, presentIllnessHistory: event.target.value })
                  }
                />
              </label>
              <SearchableMultiSelect
                className="full"
                label="Systèmes explorés dans l’anamnèse"
                values={selectedAnamnesisSystems}
                options={bodySystemOptions}
                onChange={(values) =>
                  setForm({ ...form, anamnesisComplements: formatBodySystems(values) })
                }
                placeholder="Rechercher un système puis le cocher…"
                helpText="Cochez les systèmes revus pendant l’interrogatoire clinique."
              />
              {legacyAnamnesis && (
                <div className="alert info full clinical-legacy-note">
                  <strong>Ancienne anamnèse :</strong> {legacyAnamnesis}
                </div>
              )}
              <label className="field full">
                <span>Antécédents, interventions, histoire familiale et allergies</span>
                <textarea
                  rows={4}
                  value={form.medicalHistory}
                  onChange={(event) => setForm({ ...form, medicalHistory: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Examen physique*</span>
                <textarea
                  required
                  rows={5}
                  value={form.physicalExamination}
                  onChange={(event) =>
                    setForm({ ...form, physicalExamination: event.target.value })
                  }
                />
              </label>
              <SearchableMultiSelect
                className="full"
                required
                disabled={diagnosisCatalogLoading || Boolean(diagnosisCatalogError)}
                label="Hypothèses diagnostiques CIM-10"
                values={selectedDiagnosisCodes}
                options={diagnosisOptions}
                onChange={(codes) =>
                  setForm({ ...form, diagnosis: formatDiagnoses(codes, diagnosisCatalog) })
                }
                placeholder="Saisir un code ou le nom d’une maladie…"
                helpText={
                  diagnosisCatalogLoading
                    ? 'Chargement du référentiel officiel…'
                    : diagnosisCatalogError ||
                      `${diagnosisCatalog.length.toLocaleString('fr-FR')} codes CIM-10-FR · ATIH / ANS / OMS · CC BY-ND 3.0 IGO`
                }
              />
              {legacyDiagnosis && (
                <div className="alert info full clinical-legacy-note">
                  <strong>Ancienne hypothèse :</strong> {legacyDiagnosis}
                </div>
              )}
              <label className="field full">
                <span>Conduite thérapeutique initiale*</span>
                <textarea
                  required
                  rows={4}
                  value={form.treatmentPlan}
                  onChange={(event) => setForm({ ...form, treatmentPlan: event.target.value })}
                />
              </label>
            </div>
          )}
        </section>

        {(activeExams.length > 0 || validatedExams.length > 0) && (
          <section className="clinical-form-section consultation-exam-section">
            <div className="section-title">
              <span>
                <FlaskConical size={16} />
              </span>
              <div>
                <strong>Résultats de laboratoire</strong>
                <small>Demandes, valeurs de référence et conclusion biologique</small>
              </div>
            </div>

            {activeExams.length > 0 && (
              <div className="pending-exam-list">
                {activeExams.map((exam) => (
                  <article key={exam.id}>
                    <Clock3 size={16} />
                    <div>
                      <strong>{exam.type}</strong>
                      <span>
                        Statut : {exam.status} · demandé le {formatDate(exam.requestedAt)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {validatedExams.length > 0 && (
              <div className="consultation-lab-results">
                <div className="consultation-results-title">
                  <CheckCircle2 size={19} />
                  <div>
                    <strong>Résultats validés</strong>
                    <span>Ces données biologiques sont en lecture seule.</span>
                  </div>
                </div>
                {validatedExams.map((exam) => {
                  const values = resultValues(exam);
                  return (
                    <article className="consultation-result-card" key={exam.id}>
                      <div className="consultation-result-card-heading">
                        <strong>{exam.type}</strong>
                        <span>Validé {exam.validatedAt ? formatDate(exam.validatedAt) : ''}</span>
                      </div>
                      {values.length ? (
                        <div className="table-scroll">
                          <table className="compact-table">
                            <thead>
                              <tr>
                                <th>Rubrique</th>
                                <th>Résultat</th>
                                <th>Unité</th>
                                <th>Référence</th>
                                <th>Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {values.map((value) => (
                                <tr key={value.key}>
                                  <td>{value.label}</td>
                                  <td>
                                    <strong>{value.value}</strong>
                                  </td>
                                  <td>{value.unit || '—'}</td>
                                  <td>{value.reference || '—'}</td>
                                  <td>{value.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="consultation-result-text">
                          {exam.result || 'Résultat validé.'}
                        </p>
                      )}
                      {exam.resultData?.conclusion && (
                        <p className="consultation-result-conclusion">
                          <strong>Conclusion du biologiste :</strong> {exam.resultData.conclusion}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {(postLaboratory || form.laboratoryInterpretation || mode === 'READ_ONLY') && (
          <section className="clinical-form-section consultation-post-laboratory-section">
            <div className="section-title">
              <span>2</span>
              <div>
                <strong>Interprétation post-laboratoire</strong>
                <small>Nouvelle analyse médicale sans modification de l’évaluation initiale</small>
              </div>
            </div>
            {postLaboratory ? (
              <div className="form-grid">
                <label className="field full">
                  <span>Interprétation médicale des résultats*</span>
                  <textarea
                    required
                    rows={5}
                    value={form.laboratoryInterpretation}
                    onChange={(event) =>
                      setForm({ ...form, laboratoryInterpretation: event.target.value })
                    }
                    placeholder="Analysez les valeurs, anomalies, cohérences et limites des résultats."
                  />
                </label>
                <label className="field full">
                  <span>Diagnostic confirmé ou révisé*</span>
                  <textarea
                    required
                    rows={3}
                    value={form.postLaboratoryDiagnosis}
                    onChange={(event) =>
                      setForm({ ...form, postLaboratoryDiagnosis: event.target.value })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Conduite après résultats*</span>
                  <textarea
                    required
                    rows={4}
                    value={form.postLaboratoryPlan}
                    onChange={(event) =>
                      setForm({ ...form, postLaboratoryPlan: event.target.value })
                    }
                  />
                </label>
                <label className="field full">
                  <span>Notes complémentaires</span>
                  <textarea
                    rows={3}
                    value={form.postLaboratoryNotes}
                    onChange={(event) =>
                      setForm({ ...form, postLaboratoryNotes: event.target.value })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="form-grid">
                <ReadOnlyField
                  label="Interprétation médicale des résultats"
                  value={form.laboratoryInterpretation}
                />
                <ReadOnlyField
                  label="Diagnostic confirmé ou révisé"
                  value={form.postLaboratoryDiagnosis}
                />
                <ReadOnlyField label="Conduite après résultats" value={form.postLaboratoryPlan} />
                <ReadOnlyField label="Notes complémentaires" value={form.postLaboratoryNotes} />
              </div>
            )}
          </section>
        )}

        {!readOnly && (
          <section className="clinical-form-section consultation-decision-section">
            <div className="section-title">
              <span>3</span>
              <div>
                <strong>
                  {postLaboratory ? 'Décision après interprétation' : 'Prochaine étape'}
                </strong>
                <small>
                  Choisissez une action explicite ; aucune libération administrative n’est faite ici
                </small>
              </div>
            </div>

            <div className="consultation-workflow-context">
              <strong>{guidance.title}</strong>
              <small>{guidance.detail}</small>
            </div>

            <div className="appointment-stage-summary consultation-decision-options">
              {availableDecisions.map((option) => {
                const Icon = decisionIcon[option.value] ?? Save;
                return (
                  <button
                    type="button"
                    className={`appointment-stage-card${
                      form.decision === option.value ? ' active' : ''
                    }`}
                    key={option.value}
                    onClick={() => setForm({ ...form, decision: option.value })}
                  >
                    <Icon size={19} />
                    <span>{option.label}</span>
                    <small>{option.detail}</small>
                  </button>
                );
              })}
            </div>

            {form.decision === 'LABORATORY' && (
              <div className="clinical-decision-panel">
                <div className="decision-flow-note">
                  <FlaskConical size={18} />
                  <span>
                    <strong>Après l’envoi :</strong> l’évaluation initiale devient non modifiable.
                    Le patient reviendra chez le même médecin lorsque tous les résultats seront
                    validés.
                  </span>
                </div>
                <label className="field full">
                  <span>Rechercher un examen</span>
                  <input
                    value={examSearch}
                    onChange={(event) => setExamSearch(event.target.value)}
                    placeholder="NFS, glycémie, paludisme…"
                  />
                </label>
                <div className="exam-catalog-groups">
                  {Object.entries(groupedLabServices).map(([category, services]) => (
                    <fieldset key={category}>
                      <legend>{category}</legend>
                      {services.map((service) => (
                        <label className="check-row" key={service.id}>
                          <input
                            type="checkbox"
                            checked={selectedExamIds.includes(service.id)}
                            onChange={(event) =>
                              setSelectedExamIds((current) =>
                                event.target.checked
                                  ? [...current, service.id]
                                  : current.filter((id) => id !== service.id),
                              )
                            }
                          />
                          <span>{service.name}</span>
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              </div>
            )}

            {form.decision === 'IMAGING' && (
              <div className="clinical-decision-panel">
                <div className="decision-flow-note">
                  <ScanLine size={18} />
                  <span>
                    Le patient quitte temporairement la consultation. Le médecin devient disponible
                    pendant l’examen.
                  </span>
                </div>
                <SearchableSelect
                  className="full"
                  required
                  label="Examen d’imagerie"
                  value={imagingServiceId}
                  onChange={setImagingServiceId}
                  options={imagingServices.map((service) => ({
                    value: service.id,
                    label: service.name,
                    description: service.category,
                  }))}
                />
              </div>
            )}

            {form.decision === 'HOSPITALIZATION' && (
              <div className="clinical-decision-panel hospitalization-referral-flow">
                <div className="decision-flow-note">
                  <BedDouble size={18} />
                  <span>
                    Le médecin transmet uniquement l’indication. La sortie administrative ne sera
                    possible qu’après finalisation et règlement du séjour.
                  </span>
                </div>
                <ol>
                  <li>
                    <strong>Médecin :</strong> enregistre l’indication clinique.
                  </li>
                  <li>
                    <strong>Réception et soins :</strong> organisent l’admission, la chambre et le
                    lit.
                  </li>
                  <li>
                    <strong>Caisse :</strong> finalise le compte avant toute sortie administrative.
                  </li>
                </ol>
                <SearchableSelect
                  className="full"
                  required
                  label="Type de séjour / tarif journalier"
                  value={hospitalizationServiceId}
                  onChange={setHospitalizationServiceId}
                  options={hospitalizationServices.map((service) => ({
                    value: service.id,
                    label: service.name,
                    description: service.category,
                  }))}
                />
              </div>
            )}

            {form.decision === 'TRANSFER' && (
              <div className="form-grid clinical-decision-panel">
                <SearchableSelect
                  className="full"
                  required
                  label="Médecin destinataire"
                  value={transferDoctorId}
                  onChange={setTransferDoctorId}
                  options={doctors
                    .filter((doctor) => doctor.id !== editing.doctor.id)
                    .map((doctor) => ({
                      value: doctor.id,
                      label: doctor.name,
                      description: `${doctor.specialty} · ${doctor.availability}`,
                    }))}
                />
                <label className="field full">
                  <span>Motif du transfert*</span>
                  <textarea
                    required
                    minLength={5}
                    rows={3}
                    value={transferReason}
                    onChange={(event) => setTransferReason(event.target.value)}
                  />
                </label>
              </div>
            )}

            {form.decision === 'PRESCRIPTION' && (
              <ConsultationStructuredPrescription
                consultationId={editing.id}
                patientId={editing.patient.id}
                diagnosis={form.postLaboratoryDiagnosis || form.diagnosis}
                existingPrescription={existingPrescription}
                onCreated={onPrescriptionCreated}
              />
            )}
          </section>
        )}

        <div className="modal-actions clinical-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Fermer
          </button>
          {!readOnly && (
            <button className="primary-button" disabled={submitting}>
              {submitting && <Activity className="spin" size={16} />}
              <Save size={17} />
              {saveLabel(form.decision)}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
