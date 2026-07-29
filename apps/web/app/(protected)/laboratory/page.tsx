'use client';

import {
  Activity,
  CheckCircle2,
  ChevronRight,
  FileScan,
  FlaskConical,
  Printer,
  RotateCcw,
  ShieldCheck,
  TestTube2,
  XCircle,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { PrintPreviewButton } from '@/components/print-preview-modal';
import { StatusBadge } from '@/components/status-badge';
import { api, apiUrl } from '@/lib/api';
import { matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole, hasRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

type ResultFieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'LONG_TEXT';
interface ResultField {
  key: string;
  label: string;
  type: ResultFieldType;
  unit?: string;
  reference?: string;
  required: boolean;
  options?: string[];
}
interface ResultValue {
  key: string;
  value: string;
  note?: string;
}
interface Exam {
  id: string;
  requestGroupId: string;
  consultationId?: string;
  type: string;
  observations?: string;
  result?: string;
  resultSchema?: ResultField[];
  resultData?: { values?: ResultValue[]; conclusion?: string };
  reviewComment?: string;
  status: string;
  workflowStatus: string;
  requestedAt: string;
  completedAt?: string;
  validatedAt?: string;
  patient: Patient;
  requestedByDoctor: {
    lastName: string;
    postName?: string;
    firstName?: string;
    user?: { username: string };
  };
  performedByLabTech?: { lastName: string; postName?: string; firstName?: string };
  validatedByLabTech?: { lastName: string; postName?: string; firstName?: string };
  careAuthorization?: {
    status: string;
    invoice: { number: string; status: string };
    service?: { id: string; code: string; name: string; category?: string };
  };
  catalogMetadata?: { specimenType?: string; method?: string };
  document?: { id: string; fileName: string; mimeType: string; sizeBytes: number };
}
interface ExamGroup {
  id: string;
  exams: [Exam, ...Exam[]];
  patient: Patient;
  requestedAt: string;
  requestedByDoctor: Exam['requestedByDoctor'];
}

const fallbackSchema: ResultField[] = [
  { key: 'resultat', label: 'Résultat', type: 'TEXT', required: true },
];
const schemaFor = (exam: Exam) =>
  exam.resultSchema?.length ? exam.resultSchema : fallbackSchema;
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  );
const isFinanciallyAuthorized = (exam: Exam) =>
  Boolean(
    exam.careAuthorization &&
      ['AUTHORIZED', 'WAIVED', 'CONSUMED'].includes(exam.careAuthorization.status),
  );

export default function LaboratoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ExamGroup | null>(null);
  const [completing, setCompleting] = useState<Exam | null>(null);
  const [reviewing, setReviewing] = useState<Exam | null>(null);
  const [documentExam, setDocumentExam] = useState<Exam | null>(null);
  const [resultValues, setResultValues] = useState<
    Record<string, { value: string; note: string }>
  >({});
  const [conclusion, setConclusion] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [resultFile, setResultFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canEnterResults = hasAnyRole(user, ['LAB_TECHNICIAN', 'MEDICAL_BIOLOGIST']);
  const canValidate = hasRole(user, 'MEDICAL_BIOLOGIST');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await api<Exam[]>('/laboratory/exams'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, ExamGroup>();
    rows.forEach((exam) => {
      const id = exam.requestGroupId || exam.consultationId || exam.id;
      const current = map.get(id);
      if (current) current.exams.push(exam);
      else {
        map.set(id, {
          id,
          exams: [exam],
          patient: exam.patient,
          requestedAt: exam.requestedAt,
          requestedByDoctor: exam.requestedByDoctor,
        });
      }
    });
    return [...map.values()].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }, [rows]);

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (group) =>
          (!statusFilter || group.exams.some((exam) => exam.workflowStatus === statusFilter)) &&
          group.exams.some((exam) =>
            matchesSearch(
              query,
              patientName(exam.patient),
              exam.patient.medicalRecordNumber,
              exam.type,
              exam.observations,
              exam.result,
              patientName(exam.requestedByDoctor),
              exam.careAuthorization?.invoice.number,
              exam.catalogMetadata?.specimenType,
              exam.catalogMetadata?.method,
            ),
          ),
      ),
    [groups, query, statusFilter],
  );

  const awaitingValidation = rows.filter(
    (exam) => exam.workflowStatus === 'RESULT_ENTERED',
  ).length;

  const openResult = (exam: Exam) => {
    if (!isFinanciallyAuthorized(exam)) {
      setError('Le résultat reste bloqué tant que la caisse n’a pas validé le paiement.');
      return;
    }
    const stored = new Map((exam.resultData?.values ?? []).map((item) => [item.key, item]));
    setResultValues(
      Object.fromEntries(
        schemaFor(exam).map((field, index) => {
          const item = stored.get(field.key);
          return [
            field.key,
            {
              value: item?.value ?? (index === 0 && !stored.size ? exam.result ?? '' : ''),
              note: item?.note ?? '',
            },
          ];
        }),
      ),
    );
    setConclusion(exam.resultData?.conclusion ?? '');
    setResultFile(null);
    setSelectedGroup(null);
    setCompleting(exam);
  };

  const complete = async (event: FormEvent) => {
    event.preventDefault();
    if (!completing) return;
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api(`/laboratory/exams/${completing.id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({
          resultValues: schemaFor(completing).map((field) => ({
            key: field.key,
            value: resultValues[field.key]?.value ?? '',
            note: resultValues[field.key]?.note || undefined,
          })),
          conclusion: conclusion || undefined,
        }),
      });
      if (resultFile) {
        const upload = new FormData();
        upload.append('file', resultFile);
        await api(`/laboratory/exams/${completing.id}/document`, {
          method: 'POST',
          body: upload,
        });
      }
      setCompleting(null);
      setNotice('Résultat saisi et envoyé au biologiste pour validation.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Résultat impossible à enregistrer.');
    } finally {
      setSubmitting(false);
    }
  };

  const validate = async () => {
    if (!reviewing) return;
    setSubmitting(true);
    setError('');
    try {
      await api(`/laboratory/exams/${reviewing.id}/validate`, { method: 'PATCH' });
      setReviewing(null);
      setReviewComment('');
      setNotice('Résultat biologiquement validé et rendu disponible au médecin.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Validation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const reject = async () => {
    if (!reviewing || reviewComment.trim().length < 5) {
      setError('Précisez le motif de correction en au moins cinq caractères.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api(`/laboratory/exams/${reviewing.id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ comment: reviewComment }),
      });
      setReviewing(null);
      setReviewComment('');
      setNotice('Le résultat a été renvoyé au technicien avec le motif indiqué.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Renvoi impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Analyses médicales</span>
          <h1>Laboratoire</h1>
          <p>Une ligne par demande patient, paiement contrôlé et validation biologique.</p>
        </div>
      </div>

      {canValidate && (
        <button
          className={`lab-approval-banner${awaitingValidation ? ' attention' : ''}`}
          onClick={() => setStatusFilter('RESULT_ENTERED')}
        >
          <CheckCircle2 size={22} />
          <span>
            <strong>{awaitingValidation} résultat(s) en attente de validation biologique</strong>
            <small>Contrôler les rubriques, l’unité, la référence et la conclusion.</small>
          </span>
          <ChevronRight size={20} />
        </button>
      )}

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Patient, dossier, examen, résultat, facture, échantillon…"
          status={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={[
            { value: 'PENDING_PAYMENT', label: 'Paiement attendu' },
            { value: 'PAID', label: 'Payé / à prélever' },
            { value: 'IN_PROGRESS', label: 'Analyse en cours / correction' },
            { value: 'RESULT_ENTERED', label: 'Résultat saisi' },
            { value: 'VALIDATED', label: 'Validé' },
            { value: 'COMPLETED', label: 'Terminé' },
            { value: 'CANCELLED', label: 'Annulé' },
          ]}
          resultCount={filteredGroups.length}
          resultLabel="demande(s) patient"
        />
        <div className="table-scroll">
          <table className="lab-groups-table">
            <thead>
              <tr>
                <th>Demande</th>
                <th>Patient</th>
                <th>Examens</th>
                <th>Médecin</th>
                <th>Avancement</th>
                <th>Facture</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state"><Activity className="spin" /> Chargement…</div>
                  </td>
                </tr>
              ) : filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state"><FlaskConical /><strong>Aucune demande de laboratoire</strong></div>
                  </td>
                </tr>
              ) : (
                filteredGroups.map((group) => {
                  const workflows = [...new Set(group.exams.map((exam) => exam.workflowStatus))];
                  return (
                    <tr className="clickable-row" key={group.id} onClick={() => setSelectedGroup(group)}>
                      <td><strong>{formatDate(group.requestedAt)}</strong><br /><span className="muted">{group.exams.length} examen(s)</span></td>
                      <td><strong>{patientName(group.patient)}</strong><br /><span className="muted">{group.patient.medicalRecordNumber}</span></td>
                      <td>{group.exams.map((exam) => exam.type).join(' · ')}</td>
                      <td>{patientName(group.requestedByDoctor)}</td>
                      <td><div className="status-stack">{workflows.map((workflow) => <StatusBadge status={workflow} key={workflow} />)}</div></td>
                      <td>{group.exams[0].careAuthorization?.invoice.number ?? '—'}</td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <button className="text-button" onClick={() => setSelectedGroup(group)}>
                          <TestTube2 size={15} /> Ouvrir
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
          eyebrow={`${selectedGroup.patient.medicalRecordNumber} · Demande du ${formatDate(selectedGroup.requestedAt)}`}
          onClose={() => setSelectedGroup(null)}
        >
          <div className="lab-request-summary">
            <span><strong>Médecin :</strong> {patientName(selectedGroup.requestedByDoctor)}</span>
            <span><strong>Examens :</strong> {selectedGroup.exams.length}</span>
          </div>
          <div className="table-scroll">
            <table className="compact-table">
              <thead><tr><th>Examen</th><th>Échantillon / méthode</th><th>Workflow</th><th>Paiement</th><th>Résultat</th><th>Actions</th></tr></thead>
              <tbody>
                {selectedGroup.exams.map((exam) => (
                  <tr key={exam.id}>
                    <td><strong>{exam.type}</strong>{exam.observations && <><br /><span className="muted">{exam.observations}</span></>}</td>
                    <td>{exam.catalogMetadata?.specimenType || 'Non précisé'}<br /><span className="muted">{exam.catalogMetadata?.method || 'Méthode non précisée'}</span></td>
                    <td><StatusBadge status={exam.workflowStatus} />{exam.reviewComment && <><br /><span className="muted">Correction : {exam.reviewComment}</span></>}</td>
                    <td><StatusBadge status={exam.careAuthorization?.status ?? 'PENDING'} /><br /><span className="muted">{exam.careAuthorization?.invoice.number ?? '—'}</span></td>
                    <td><StructuredResult exam={exam} /></td>
                    <td>
                      <div className="row-actions">
                        {canEnterResults && ['PAID', 'IN_PROGRESS'].includes(exam.workflowStatus) && (
                          <button className="text-button" disabled={!isFinanciallyAuthorized(exam)} onClick={() => openResult(exam)}>
                            <FileScan size={15} /> Saisir
                          </button>
                        )}
                        {canValidate && exam.workflowStatus === 'RESULT_ENTERED' && (
                          <button className="text-button" onClick={() => { setReviewing(exam); setSelectedGroup(null); }}>
                            <ShieldCheck size={15} /> Valider
                          </button>
                        )}
                        {exam.document && (
                          <button className="text-button" onClick={() => { setDocumentExam(exam); setSelectedGroup(null); }}>
                            <FileScan size={15} /> Document
                          </button>
                        )}
                        <PrintPreviewButton kind="laboratory" id={exam.id} label="Imprimer" icon={<Printer size={15} />} />
                        <CustomFieldsEditor entity="LABORATORY" entityId={exam.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {completing && (
        <Modal
          wide
          title={`Résultat · ${completing.type}`}
          eyebrow={`${patientName(completing.patient)} · ${completing.patient.medicalRecordNumber}`}
          onClose={() => setCompleting(null)}
        >
          <form onSubmit={complete}>
            <div className="lab-result-context">
              <span><strong>Échantillon :</strong> {completing.catalogMetadata?.specimenType || 'Non précisé'}</span>
              <span><strong>Méthode :</strong> {completing.catalogMetadata?.method || 'Non précisée'}</span>
              <span><strong>Facture :</strong> {completing.careAuthorization?.invoice.number}</span>
            </div>
            <div className="table-scroll">
              <table className="compact-table lab-entry-table">
                <thead><tr><th>Rubrique</th><th>Résultat *</th><th>Unité</th><th>Valeur de référence</th><th>Note</th></tr></thead>
                <tbody>
                  {schemaFor(completing).map((field) => (
                    <tr key={field.key}>
                      <td><strong>{field.label}</strong>{field.required && <span className="required-mark"> *</span>}</td>
                      <td>
                        {field.type === 'LONG_TEXT' ? (
                          <textarea required={field.required} rows={2} value={resultValues[field.key]?.value ?? ''} onChange={(event) => setResultValues((current) => ({ ...current, [field.key]: { value: event.target.value, note: current[field.key]?.note ?? '' } }))} />
                        ) : field.type === 'SELECT' ? (
                          <select required={field.required} value={resultValues[field.key]?.value ?? ''} onChange={(event) => setResultValues((current) => ({ ...current, [field.key]: { value: event.target.value, note: current[field.key]?.note ?? '' } }))}><option value="">Sélectionner</option>{(field.options ?? []).map((option) => <option key={option}>{option}</option>)}</select>
                        ) : (
                          <input required={field.required} inputMode={field.type === 'NUMBER' ? 'decimal' : 'text'} value={resultValues[field.key]?.value ?? ''} onChange={(event) => setResultValues((current) => ({ ...current, [field.key]: { value: event.target.value, note: current[field.key]?.note ?? '' } }))} />
                        )}
                      </td>
                      <td>{field.unit || '—'}</td>
                      <td>{field.reference || 'Selon méthode / patient'}</td>
                      <td><input placeholder="Facultatif" value={resultValues[field.key]?.note ?? ''} onChange={(event) => setResultValues((current) => ({ ...current, [field.key]: { value: current[field.key]?.value ?? '', note: event.target.value } }))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="field"><span>Conclusion / interprétation</span><textarea rows={3} maxLength={5000} value={conclusion} onChange={(event) => setConclusion(event.target.value)} /></label>
            <label className="field"><span>Document numérisé (facultatif)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setResultFile(event.target.files?.[0] ?? null)} /><small>PDF ou image, maximum 8 Mo.</small></label>
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCompleting(null)}>Annuler</button><button className="primary-button" disabled={submitting}>{submitting && <Activity className="spin" size={16} />} Soumettre au biologiste</button></div>
          </form>
        </Modal>
      )}

      {reviewing && (
        <Modal
          wide
          title={`Validation biologique · ${reviewing.type}`}
          eyebrow={`${patientName(reviewing.patient)} · ${reviewing.patient.medicalRecordNumber}`}
          onClose={() => setReviewing(null)}
        >
          <FullResultTable exam={reviewing} />
          <label className="field"><span>Motif en cas de renvoi au technicien</span><textarea rows={3} minLength={5} value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setReviewing(null)}>Fermer</button>
            <button type="button" className="secondary-button danger" disabled={submitting || reviewComment.trim().length < 5} onClick={() => void reject()}><RotateCcw size={16} /> Renvoyer pour correction</button>
            <button type="button" className="primary-button" disabled={submitting} onClick={() => void validate()}><CheckCircle2 size={16} /> Valider biologiquement</button>
          </div>
        </Modal>
      )}

      {documentExam && (
        <Modal
          wide
          title={`Document · ${documentExam.type}`}
          eyebrow={`${patientName(documentExam.patient)} · affichage dans la même page`}
          onClose={() => setDocumentExam(null)}
        >
          <div className="lab-document-viewer">
            {documentExam.document?.mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={apiUrl(`/laboratory/exams/${documentExam.id}/document`)} alt={documentExam.document.fileName} />
            ) : (
              <iframe src={apiUrl(`/laboratory/exams/${documentExam.id}/document`)} title={documentExam.document?.fileName ?? 'Document laboratoire'} />
            )}
          </div>
          <div className="modal-actions"><button className="secondary-button" onClick={() => setDocumentExam(null)}>Fermer</button></div>
        </Modal>
      )}
    </>
  );
}

function StructuredResult({ exam }: { exam: Exam }) {
  const values = exam.resultData?.values;
  if (!values?.length) return <span className="muted result-preview">{exam.result || '—'}</span>;
  const definitions = new Map(schemaFor(exam).map((field) => [field.key, field]));
  return (
    <div className="structured-result-preview">
      {values.slice(0, 3).map((item) => {
        const definition = definitions.get(item.key);
        return <span key={item.key}><strong>{definition?.label ?? item.key} :</strong> {item.value}{definition?.unit ? ` ${definition.unit}` : ''}</span>;
      })}
      {values.length > 3 && <small>+ {values.length - 3} autre(s)</small>}
    </div>
  );
}

function FullResultTable({ exam }: { exam: Exam }) {
  const values = exam.resultData?.values ?? [];
  const definitions = new Map(schemaFor(exam).map((field) => [field.key, field]));
  return (
    <>
      {values.length === 0 ? (
        <div className="empty-state"><XCircle /><strong>Aucun résultat structuré</strong></div>
      ) : (
        <div className="table-scroll">
          <table className="compact-table lab-review-table">
            <thead><tr><th>Rubrique</th><th>Résultat saisi</th><th>Unité</th><th>Référence</th><th>Note</th></tr></thead>
            <tbody>
              {values.map((item) => {
                const definition = definitions.get(item.key);
                return <tr key={item.key}><td>{definition?.label ?? item.key}</td><td><strong>{item.value}</strong></td><td>{definition?.unit || '—'}</td><td>{definition?.reference || 'Selon méthode / patient'}</td><td>{item.note || '—'}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      {exam.resultData?.conclusion && <div className="lab-result-conclusion"><strong>Conclusion / interprétation</strong><p>{exam.resultData.conclusion}</p></div>}
    </>
  );
}
