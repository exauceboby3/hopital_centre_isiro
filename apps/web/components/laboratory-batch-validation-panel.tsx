'use client';

import { CheckCircle2, FlaskConical, ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import { Modal } from './modal';
import { useAuth } from './auth-provider';

interface ResultField {
  key: string;
  label: string;
  unit?: string;
  reference?: string;
}

interface ResultValue {
  key: string;
  value: string;
  note?: string;
}

interface Exam {
  id: string;
  requestGroupId: string;
  type: string;
  status: string;
  workflowStatus: string;
  result?: string;
  resultSchema?: ResultField[];
  resultData?: { values?: ResultValue[]; conclusion?: string };
  requestedAt: string;
  patient: Patient;
}

interface ExamGroup {
  id: string;
  patient: Patient;
  requestedAt: string;
  exams: Exam[];
}

function resultRows(exam: Exam) {
  const definitions = new Map((exam.resultSchema ?? []).map((field) => [field.key, field]));
  return (exam.resultData?.values ?? []).map((value) => ({
    ...value,
    label: definitions.get(value.key)?.label ?? value.key,
    unit: definitions.get(value.key)?.unit,
    reference: definitions.get(value.key)?.reference,
  }));
}

export function LaboratoryBatchValidationPanel() {
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed = pathname === '/laboratory' && hasRole(user, 'MEDICAL_BIOLOGIST');
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState<Exam[]>([]);
  const [reviewing, setReviewing] = useState<ExamGroup | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      setRows(await api<Exam[]>('/laboratory/exams'));
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Chargement des validations impossible.');
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) {
      setTarget(null);
      return;
    }

    let slot: HTMLDivElement | null = null;
    const mount = () => {
      const heading = document.querySelector<HTMLElement>('.page-heading');
      if (!heading?.parentElement) return false;
      const existing = heading.parentElement.querySelector<HTMLElement>('.laboratory-batch-slot');
      if (existing) {
        setTarget(existing);
        return true;
      }
      slot = document.createElement('div');
      slot.className = 'laboratory-batch-slot';
      heading.insertAdjacentElement('afterend', slot);
      setTarget(slot);
      return true;
    };

    if (!mount()) {
      const observer = new MutationObserver(() => {
        if (mount()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }
    return () => slot?.remove();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    const removeIndividualValidation = () => {
      document.querySelectorAll<HTMLButtonElement>('.modal-card button').forEach((button) => {
        const label = button.textContent?.trim() ?? '';
        if (label === 'Valider') {
          button.textContent = 'Contrôler';
          button.title = 'Consulter ce résultat. La confirmation finale se fait pour toute la demande.';
        }
        if (label.includes('Valider biologiquement')) {
          button.hidden = true;
        }
      });
    };
    removeIndividualValidation();
    const observer = new MutationObserver(removeIndividualValidation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [allowed]);

  const readyGroups = useMemo(() => {
    const groups = new Map<string, ExamGroup>();
    rows.forEach((exam) => {
      const current = groups.get(exam.requestGroupId);
      if (current) current.exams.push(exam);
      else {
        groups.set(exam.requestGroupId, {
          id: exam.requestGroupId,
          patient: exam.patient,
          requestedAt: exam.requestedAt,
          exams: [exam],
        });
      }
    });
    return [...groups.values()]
      .filter(
        (group) =>
          group.exams.some((exam) => exam.workflowStatus === 'RESULT_ENTERED') &&
          group.exams.every((exam) =>
            ['RESULT_ENTERED', 'VALIDATED', 'CANCELLED'].includes(exam.workflowStatus),
          ),
      )
      .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
  }, [rows]);

  const validateGroup = async (group: ExamGroup) => {
    setSubmitting(true);
    try {
      await api(`/laboratory/exams/batch/${group.id}/validate`, { method: 'PATCH' });
      setReviewing(null);
      notifySuccess(
        `Les ${group.exams.length} résultat(s) de ${patientName(group.patient)} ont été confirmés ensemble et transmis au médecin.`,
        'Validation biologique terminée',
      );
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Validation groupée impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed || !target) return null;

  return createPortal(
    <>
      <section className={`panel laboratory-batch-panel${readyGroups.length ? ' attention' : ''}`}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Validation biologique groupée</span>
            <h2>Demandes prêtes à confirmer</h2>
            <p>
              Le biologiste contrôle tous les examens d’une même demande puis les valide en une seule
              opération.
            </p>
          </div>
          <ShieldCheck size={26} />
        </div>
        {readyGroups.length ? (
          <div className="laboratory-batch-grid">
            {readyGroups.map((group) => (
              <article key={group.id}>
                <div>
                  <strong>{patientName(group.patient)}</strong>
                  <span>{group.patient.medicalRecordNumber}</span>
                  <small>{group.exams.map((exam) => exam.type).join(' · ')}</small>
                </div>
                <button className="primary-button" type="button" onClick={() => setReviewing(group)}>
                  <CheckCircle2 size={16} /> Contrôler et valider ensemble
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty-state">
            <FlaskConical size={22} />
            <span>Aucune demande complète n’attend une validation groupée.</span>
          </div>
        )}
      </section>

      {reviewing && (
        <Modal
          wide
          title={`Validation groupée · ${patientName(reviewing.patient)}`}
          eyebrow={`${reviewing.patient.medicalRecordNumber} · ${reviewing.exams.length} examen(s)`}
          onClose={() => setReviewing(null)}
        >
          <div className="alert info">
            Vérifiez chaque rubrique, unité, valeur de référence et conclusion. La confirmation ci-dessous
            valide tous les résultats de cette demande en même temps.
          </div>
          <div className="laboratory-group-review">
            {reviewing.exams.map((exam) => {
              const values = resultRows(exam);
              return (
                <section className="panel compact-panel" key={exam.id}>
                  <div className="panel-heading">
                    <strong>{exam.type}</strong>
                    <span className="record-number">Résultat saisi</span>
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
                              <td><strong>{value.value}</strong></td>
                              <td>{value.unit || '—'}</td>
                              <td>{value.reference || '—'}</td>
                              <td>{value.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>{exam.result || 'Aucun résultat textuel.'}</p>
                  )}
                  {exam.resultData?.conclusion && (
                    <p className="lab-result-conclusion">
                      <strong>Conclusion :</strong> {exam.resultData.conclusion}
                    </p>
                  )}
                </section>
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setReviewing(null)}>
              Fermer sans valider
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void validateGroup(reviewing)}
            >
              <CheckCircle2 size={17} /> Confirmer tous les résultats
            </button>
          </div>
        </Modal>
      )}
    </>,
    target,
  );
}
