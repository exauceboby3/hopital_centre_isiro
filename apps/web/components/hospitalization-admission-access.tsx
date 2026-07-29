'use client';

import { BedDouble, Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import { useAuth } from './auth-provider';
import { Modal } from './modal';
import { SearchableSelect } from './searchable-select';

interface HospitalizationAuthorization {
  id: string;
  patientId: string;
  description: string;
  status: string;
  patient: Patient;
  hospitalization?: { id: string } | null;
  invoice: { number: string; status: string };
}

interface Bed {
  id: string;
  code: string;
  status: string;
}

interface Room {
  id: string;
  code: string;
  name: string;
  service?: string;
  beds: Bed[];
}

const emptyForm = {
  authorizationId: '',
  patientId: '',
  bedId: '',
  reason: '',
  expectedDischargeAt: '',
  notes: '',
};

export function HospitalizationAdmissionAccess() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authorizations, setAuthorizations] = useState<HospitalizationAuthorization[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);

  const canAdmit = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
    'RECEPTIONIST',
    'SECRETARY',
    'NURSE',
  ]);

  useEffect(() => {
    if (pathname !== '/hospitalizations' || !canAdmit) {
      setTarget(null);
      return;
    }

    const mount = () => {
      const actions = document.querySelector<HTMLElement>('.page-heading .heading-actions');
      if (!actions) return false;
      setTarget(actions);
      [...actions.querySelectorAll<HTMLButtonElement>('button')]
        .filter((button) => button.textContent?.includes('Admettre un patient'))
        .forEach((button) => {
          button.hidden = true;
          button.dataset.replacedAdmissionButton = 'true';
        });
      return true;
    };

    if (mount()) return;
    const observer = new MutationObserver(() => {
      if (mount()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [canAdmit, pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [authorized, waived, roomRows] = await Promise.all([
        api<HospitalizationAuthorization[]>(
          '/billing/authorizations?type=HOSPITALIZATION&status=AUTHORIZED',
        ),
        api<HospitalizationAuthorization[]>(
          '/billing/authorizations?type=HOSPITALIZATION&status=WAIVED',
        ),
        api<Room[]>('/hospitalizations/rooms'),
      ]);
      setAuthorizations(
        [...authorized, ...waived].filter((authorization) => !authorization.hospitalization),
      );
      setRooms(roomRows);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Chargement des admissions impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const availableBeds = useMemo(
    () =>
      rooms.flatMap((room) =>
        room.beds
          .filter((bed) => bed.status === 'AVAILABLE')
          .map((bed) => ({ ...bed, room })),
      ),
    [rooms],
  );

  const close = () => {
    setOpen(false);
    setForm(emptyForm);
  };

  const admit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.authorizationId || !form.patientId || !form.bedId) {
      notifyError("Sélectionnez la demande médicale et le lit d'hospitalisation.");
      return;
    }
    setSubmitting(true);
    try {
      const authorization = authorizations.find((entry) => entry.id === form.authorizationId);
      await api('/hospitalizations', {
        method: 'POST',
        body: JSON.stringify({
          patientId: form.patientId,
          authorizationId: form.authorizationId,
          bedId: form.bedId,
          reason: form.reason,
          notes: form.notes || undefined,
          expectedDischargeAt: form.expectedDischargeAt
            ? new Date(form.expectedDischargeAt).toISOString()
            : undefined,
        }),
      });
      close();
      notifySuccess(
        `${authorization ? patientName(authorization.patient) : 'Le patient'} a été admis. Le séjour sera facturé à la sortie.`,
        'Admission enregistrée',
      );
      window.setTimeout(() => window.location.reload(), 700);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Admission impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!target || !canAdmit || pathname !== '/hospitalizations') return null;

  return createPortal(
    <>
      <button className="primary-button" type="button" onClick={() => setOpen(true)}>
        <Plus size={18} /> Admettre un patient
      </button>
      {open && (
        <Modal title="Admettre un patient" eyebrow="Demande médicale" onClose={close}>
          <form onSubmit={admit}>
            <div className="payment-gate-notice hospitalization-deferred-billing-note">
              <BedDouble size={19} />
              <div>
                <strong>Admission sans paiement préalable</strong>
                <span>
                  Le médecin a demandé l’hospitalisation. La réception et les infirmiers attribuent
                  maintenant un lit. La facture du séjour sera finalisée et payée à la sortie.
                </span>
              </div>
            </div>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient signalé pour hospitalisation"
                value={form.authorizationId}
                onChange={(authorizationId) => {
                  const authorization = authorizations.find(
                    (entry) => entry.id === authorizationId,
                  );
                  setForm((current) => ({
                    ...current,
                    authorizationId,
                    patientId: authorization?.patientId ?? '',
                    reason:
                      authorization?.description ??
                      "Hospitalisation demandée par le médecin traitant.",
                  }));
                }}
                options={authorizations.map((authorization) => ({
                  value: authorization.id,
                  label: patientName(authorization.patient),
                  description: `${authorization.patient.medicalRecordNumber} · ${authorization.description}`,
                }))}
                helpText={
                  loading
                    ? 'Chargement des demandes…'
                    : authorizations.length
                      ? 'Sélectionnez la demande transmise par le médecin.'
                      : "Aucune nouvelle demande d'hospitalisation n'est disponible."
                }
              />
              <label className="field full">
                <span>Lit disponible *</span>
                <select
                  required
                  value={form.bedId}
                  onChange={(event) => setForm({ ...form, bedId: event.target.value })}
                >
                  <option value="">Sélectionner une chambre et un lit</option>
                  {availableBeds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.room.code} — {bed.room.name} — Lit {bed.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sortie prévue</span>
                <input
                  type="datetime-local"
                  value={form.expectedDischargeAt}
                  onChange={(event) =>
                    setForm({ ...form, expectedDischargeAt: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Motif médical *</span>
                <textarea
                  required
                  rows={4}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Consignes d’admission</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={close}>
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || loading || !authorizations.length || !availableBeds.length}
              >
                Confirmer l’admission
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>,
    target,
  );
}
