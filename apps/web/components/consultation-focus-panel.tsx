'use client';

import { FileText, FlaskConical, Stethoscope, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { Patient } from '@/lib/types';

type ConsultationDecision =
  | 'CONTINUE'
  | 'LABORATORY'
  | 'IMAGING'
  | 'HOSPITALIZATION'
  | 'TRANSFER'
  | 'PRESCRIPTION'
  | 'DISCHARGE';

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

interface ConsultationExam {
  id: string;
  type: string;
  status: string;
  result?: string;
  resultSchema?: ResultField[];
  resultData?: {
    values?: ResultValue[];
    conclusion?: string;
  };
  validatedAt?: string;
}

interface FocusedConsultation {
  id: string;
  status: string;
  createdAt?: string;
  patient: Patient;
  doctor: {
    lastName: string;
    postName?: string;
    firstName?: string;
    specialty?: string;
  };
  appointment?: {
    journeyStage?: string;
  };
  examRequests: ConsultationExam[];
}

interface FocusConsultationEvent {
  recordNumber?: string;
}

const visibleResultStatuses = new Set(['VALIDATED', 'COMPLETED']);
const returnStages = new Set(['RETURN_TO_DOCTOR', 'IN_CONSULTATION']);
const focusEventName = 'hospital:focus-consultation';

const decisionLabels: Record<ConsultationDecision, string> = {
  CONTINUE: 'Interpréter les résultats et compléter la consultation',
  LABORATORY: 'Demander de nouveaux examens de laboratoire',
  IMAGING: 'Orienter vers l’imagerie médicale',
  HOSPITALIZATION: 'Orienter vers l’hospitalisation',
  TRANSFER: 'Transférer vers un autre médecin',
  PRESCRIPTION: 'Faire une prescription et terminer',
  DISCHARGE: 'Libérer le patient',
};

function findConsultationRow(recordNumber: string) {
  return [...document.querySelectorAll<HTMLTableRowElement>('.table-panel tbody tr')].find((row) =>
    row.textContent?.includes(recordNumber),
  );
}

function findModalSection(modal: HTMLElement, text: string) {
  return [...modal.querySelectorAll<HTMLElement>('section, label')].find((element) =>
    element.textContent?.includes(text),
  );
}

function prepareConsultationModal(decision: ConsultationDecision) {
  const modal = [...document.querySelectorAll<HTMLElement>('.modal-card')].at(-1);
  if (!modal) return;

  const decisionSelect = [...modal.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
    [...select.options].some((option) => option.value === decision),
  );
  if (decisionSelect) {
    decisionSelect.value = decision;
    decisionSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const form = modal.querySelector('form');
  const previousNotice = modal.querySelector('.consultation-orientation-notice');
  previousNotice?.remove();
  if (form) {
    const notice = document.createElement('div');
    notice.className = 'consultation-orientation-notice';
    notice.innerHTML = `<strong>Suite de la prise en charge</strong><span>${decisionLabels[decision]}. Vérifiez l’interprétation, le diagnostic, la prescription et l’orientation avant d’enregistrer.</span>`;
    form.prepend(notice);
  }

  const target =
    decision === 'PRESCRIPTION'
      ? findModalSection(modal, 'Prescription structurée')
      : findModalSection(modal, 'Décision de fin de consultation');
  window.setTimeout(() => {
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (decision === 'PRESCRIPTION') {
      target?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
    } else {
      decisionSelect?.focus();
    }
  }, 80);
}

function openConsultationForm(recordNumber: string, decision: ConsultationDecision = 'CONTINUE') {
  const row = findConsultationRow(recordNumber);
  const button = row
    ? [...row.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
        /Ouvrir la fiche|Renseigner/i.test(item.textContent ?? ''),
      )
    : undefined;
  if (!button) return;
  button.click();
  window.setTimeout(() => prepareConsultationModal(decision), 160);
}

function valuesFor(exam: ConsultationExam) {
  const schema = Array.isArray(exam.resultSchema) ? exam.resultSchema : [];
  const definitions = new Map(schema.map((field) => [field.key, field]));
  return (exam.resultData?.values ?? []).map((value) => ({
    ...value,
    label: definitions.get(value.key)?.label ?? value.key,
    unit: definitions.get(value.key)?.unit,
    reference: definitions.get(value.key)?.reference,
  }));
}

function hasValidatedResults(consultation: FocusedConsultation) {
  return consultation.examRequests.some((exam) => visibleResultStatuses.has(exam.status));
}

function selectConsultation(rows: FocusedConsultation[], requestedRecord?: string) {
  if (requestedRecord) {
    const exact = rows.find(
      (row) =>
        row.patient.medicalRecordNumber.toLocaleUpperCase() === requestedRecord.toLocaleUpperCase(),
    );
    if (exact) return exact;
  }

  return rows.find(
    (row) =>
      hasValidatedResults(row) &&
      returnStages.has(row.appointment?.journeyStage ?? '') &&
      ['WAITING', 'IN_PROGRESS'].includes(row.status),
  );
}

export function ConsultationFocusPanel() {
  const pathname = usePathname();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [consultation, setConsultation] = useState<FocusedConsultation | null>(null);
  const [recordNumber, setRecordNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (pathname !== '/consultations') {
      setConsultation(null);
      setRecordNumber('');
      return;
    }

    const mount = () => {
      const heading = document.querySelector<HTMLElement>('.page-heading');
      if (
        !heading?.parentElement ||
        heading.nextElementSibling?.classList.contains('consultation-focus-slot')
      ) {
        return false;
      }
      const slot = document.createElement('div');
      slot.className = 'consultation-focus-slot';
      heading.insertAdjacentElement('afterend', slot);
      setTarget(slot);
      return true;
    };

    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    if (pathname !== '/consultations') return;

    const focus = (requestedRecord?: string) => {
      setClosed(false);
      setLoading(true);
      void api<FocusedConsultation[]>('/consultations')
        .then((rows) => {
          const selected = selectConsultation(rows, requestedRecord);
          setConsultation(selected ?? null);
          setRecordNumber(selected?.patient.medicalRecordNumber ?? requestedRecord ?? '');

          window.sessionStorage.removeItem('hospital:open-consultation-patient');
          if (window.location.search) window.history.replaceState({}, '', '/consultations');

          if (selected) {
            window.setTimeout(() => {
              const row = findConsultationRow(selected.patient.medicalRecordNumber);
              row?.classList.add('consultation-focus-row');
              row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 150);
          }
        })
        .finally(() => setLoading(false));
    };

    const parameters = new URLSearchParams(window.location.search);
    const initialRecord =
      parameters.get('patient') ??
      window.sessionStorage.getItem('hospital:open-consultation-patient') ??
      undefined;
    focus(initialRecord);

    const onFocus = (event: Event) => {
      const requestedRecord = (event as CustomEvent<FocusConsultationEvent>).detail?.recordNumber;
      focus(requestedRecord);
    };
    window.addEventListener(focusEventName, onFocus);
    return () => window.removeEventListener(focusEventName, onFocus);
  }, [pathname]);

  const validatedExams = useMemo(
    () => consultation?.examRequests.filter((exam) => visibleResultStatuses.has(exam.status)) ?? [],
    [consultation],
  );

  if (!target || closed || (!loading && !consultation)) return null;

  return createPortal(
    <section className="consultation-focus-panel" aria-live="polite">
      <div className="consultation-focus-heading">
        <div>
          <span className="eyebrow">
            {validatedExams.length ? 'Retour du laboratoire' : 'Patient pris en charge'}
          </span>
          <h2>
            {consultation ? patientName(consultation.patient) : 'Ouverture de la consultation…'}
          </h2>
          {consultation && (
            <p>
              {consultation.patient.medicalRecordNumber} · Médecin : {patientName(consultation.doctor)}
            </p>
          )}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Masquer ce résumé"
          onClick={() => setClosed(true)}
        >
          <X size={19} />
        </button>
      </div>

      {loading ? (
        <div className="consultation-focus-loading">Chargement de la consultation…</div>
      ) : validatedExams.length ? (
        <div className="consultation-lab-results">
          <div className="consultation-results-title">
            <FlaskConical size={19} />
            <div>
              <strong>Résultats biologiquement validés</strong>
              <span>
                Lisez les résultats, puis choisissez directement la suite de la prise en charge.
              </span>
            </div>
          </div>

          {validatedExams.map((exam) => {
            const values = valuesFor(exam);
            return (
              <article className="consultation-result-card" key={exam.id}>
                <div className="consultation-result-card-heading">
                  <strong>{exam.type}</strong>
                  <span>Validé</span>
                </div>
                {values.length ? (
                  <div className="table-scroll">
                    <table className="compact-table">
                      <thead>
                        <tr>
                          <th>Rubrique</th>
                          <th>Résultat</th>
                          <th>Unité</th>
                          <th>Valeur de référence</th>
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
                  <p className="consultation-result-text">
                    {exam.result || 'Résultat validé sans valeur textuelle.'}
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
      ) : (
        <div className="consultation-focus-empty">
          <FileText size={20} />
          <span>Aucun résultat de laboratoire validé n’est encore disponible pour ce patient.</span>
        </div>
      )}

      {consultation && (
        <div className="consultation-orientation-actions">
          <div className="consultation-orientation-actions-heading">
            <strong>Que doit faire le médecin maintenant ?</strong>
            <span>
              Chaque bouton ouvre la même consultation et présélectionne l’orientation correspondante. Rien n’est validé avant l’enregistrement final.
            </span>
          </div>
          <div className="consultation-action-grid">
            <button
              type="button"
              className="primary-button"
              onClick={() => openConsultationForm(recordNumber, 'CONTINUE')}
            >
              <Stethoscope size={17} /> Interpréter et décider
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openConsultationForm(recordNumber, 'PRESCRIPTION')}
            >
              Prescription
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openConsultationForm(recordNumber, 'HOSPITALIZATION')}
            >
              Hospitalisation
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openConsultationForm(recordNumber, 'LABORATORY')}
            >
              Nouveaux examens
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openConsultationForm(recordNumber, 'IMAGING')}
            >
              Imagerie
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => openConsultationForm(recordNumber, 'TRANSFER')}
            >
              Transfert médical
            </button>
            <button
              type="button"
              className="secondary-button danger-outline"
              onClick={() => openConsultationForm(recordNumber, 'DISCHARGE')}
            >
              Libérer le patient
            </button>
          </div>
        </div>
      )}
    </section>,
    target,
  );
}
