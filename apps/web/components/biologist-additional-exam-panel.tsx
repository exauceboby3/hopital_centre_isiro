'use client';

import { FlaskConical, PlusCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import { useAuth } from './auth-provider';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

interface ExamRow {
  id: string;
  requestGroupId: string;
  type: string;
  workflowStatus: string;
  patient: Patient;
  careAuthorization?: { service?: { id: string } };
}

interface LabService {
  id: string;
  code: string;
  name: string;
  category?: string;
}

interface ExamGroup {
  id: string;
  patient: Patient;
  exams: ExamRow[];
}

type Urgency = 'ROUTINE' | 'URGENT' | 'CRITICAL';

export function BiologistAdditionalExamPanel() {
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed = pathname === '/laboratory' && hasRole(user, 'MEDICAL_BIOLOGIST');
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [services, setServices] = useState<LabService[]>([]);
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('ROUTINE');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!allowed) {
      setTarget(null);
      return;
    }
    const mount = () => {
      const heading = document.querySelector<HTMLElement>('.page-heading');
      if (!heading?.parentElement) return false;
      let slot = heading.parentElement.querySelector<HTMLElement>('.biologist-extra-exam-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'biologist-extra-exam-slot';
        heading.insertAdjacentElement('afterend', slot);
      }
      setTarget(slot);
      return true;
    };
    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void Promise.all([
      api<ExamRow[]>('/laboratory/exams'),
      api<LabService[]>('/billing/services?type=LABORATORY'),
    ])
      .then(([examRows, catalog]) => {
        setRows(examRows);
        setServices(catalog);
      })
      .catch((error) =>
        notifyError(
          error instanceof Error ? error.message : 'Chargement du laboratoire impossible.',
        ),
      );
  }, [allowed, open]);

  const groups = useMemo(() => {
    const result = new Map<string, ExamGroup>();
    rows.forEach((row) => {
      if (!row.requestGroupId || ['VALIDATED', 'CANCELLED'].includes(row.workflowStatus)) return;
      const existing = result.get(row.requestGroupId);
      if (existing) existing.exams.push(row);
      else
        result.set(row.requestGroupId, {
          id: row.requestGroupId,
          patient: row.patient,
          exams: [row],
        });
    });
    return [...result.values()];
  }, [rows]);

  const selectedGroup = groups.find((group) => group.id === groupId);
  const availableServices = services.filter(
    (service) =>
      !selectedGroup?.exams.some((exam) => exam.careAuthorization?.service?.id === service.id),
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupId || !serviceId || reason.trim().length < 5) return;
    setSubmitting(true);
    try {
      const exam = await api<{
        type: string;
        careAuthorization: {
          status: string;
          paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
        };
        additionalExamDecision: { status: string; thresholdCdf: number };
      }>(`/laboratory/exams/batch/${groupId}/additional`, {
        method: 'POST',
        body: JSON.stringify({ serviceId, urgency, reason: reason.trim() }),
      });
      const pendingDoctor = exam.additionalExamDecision.status === 'PENDING_DOCTOR';
      notifySuccess(
        pendingDoctor
          ? `${exam.type} a été ajouté. Le paiement est transmis à la caisse et la validation du médecin est attendue.`
          : `${exam.type} a été ajouté. Le paiement est transmis à la caisse.`,
        pendingDoctor ? 'Validation médicale requise' : 'Examen complémentaire ajouté',
      );
      setOpen(false);
      setGroupId('');
      setServiceId('');
      setUrgency('ROUTINE');
      setReason('');
      setRows(await api<ExamRow[]>('/laboratory/exams'));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Ajout de l’examen impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed || !target) return null;

  return createPortal(
    <>
      <section className="panel biologist-extra-exam-panel">
        <div className="biologist-extra-exam-icon">
          <FlaskConical size={24} />
        </div>
        <div>
          <span className="eyebrow">Action réservée au biologiste</span>
          <strong>Examen complémentaire</strong>
          <small>
            Sélectionnez une demande active, choisissez l’examen et justifiez son ajout.{' '}
            {groups.length} demande(s) disponible(s).
          </small>
        </div>
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>
          <PlusCircle size={17} /> Ajouter un examen complémentaire
        </button>
      </section>

      {open && (
        <Modal
          title="Ajouter un examen complémentaire"
          eyebrow="Décision biologique et facturation"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            {groups.length === 0 && (
              <div className="alert warning">
                Aucune demande de laboratoire active n’est disponible.
              </div>
            )}
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="1. Patient et demande active"
                value={groupId}
                onChange={(value) => {
                  setGroupId(value);
                  setServiceId('');
                }}
                options={groups.map((group) => ({
                  value: group.id,
                  label: patientName(group.patient),
                  description: `${group.patient.medicalRecordNumber} · ${group.exams.map((exam) => exam.type).join(', ')}`,
                }))}
              />
              <SearchableSelect
                required
                className="full"
                label="2. Examen à ajouter"
                value={serviceId}
                onChange={setServiceId}
                options={availableServices.map((service) => ({
                  value: service.id,
                  label: service.name,
                  description: service.category ?? 'Laboratoire',
                }))}
              />
              <label className="field full">
                <span>3. Niveau d’urgence *</span>
                <select
                  value={urgency}
                  onChange={(event) => setUrgency(event.target.value as Urgency)}
                >
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </label>
              <label className="field full">
                <span>4. Justification biologique ou clinique *</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Précisez pourquoi cet examen est nécessaire…"
                />
              </label>
              <div className="alert info full">
                <FlaskConical size={18} />
                La demande de paiement sera transmise automatiquement à la caisse. Selon la règle
                interne, une validation médicale supplémentaire peut être demandée avant exécution.
              </div>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || !groupId || !serviceId || groups.length === 0}
              >
                {submitting ? 'Enregistrement…' : 'Ajouter l’examen'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>,
    target,
  );
}
