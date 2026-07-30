'use client';

import { Activity, ArrowRightLeft, Clock3, Siren, Stethoscope, UserRoundCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { notifyError, notifySuccess } from '@/lib/notifications';

interface WaitingPatient {
  id: string;
  position: number;
  arrivedAt: string;
  waitingSeconds: number;
  service: string;
  journeyStage: string;
  triageLevel: 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'BLUE';
  chiefComplaint?: string | null;
  painScore?: number | null;
  patientId: string;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
  doctorId: string;
  doctorLastName: string;
  doctorPostName?: string | null;
  doctorFirstName?: string | null;
  specialty: string;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  availability: 'AVAILABLE' | 'BUSY' | 'UNKNOWN';
}

const triageRank: Record<WaitingPatient['triageLevel'], number> = {
  RED: 1,
  ORANGE: 2,
  YELLOW: 3,
  GREEN: 4,
  BLUE: 5,
};

const triageLabel: Record<WaitingPatient['triageLevel'], string> = {
  RED: 'Rouge · urgence vitale',
  ORANGE: 'Orange · très urgent',
  YELLOW: 'Jaune · urgent',
  GREEN: 'Vert · stable',
  BLUE: 'Bleu · non urgent',
};

const formatArrival = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );

const patientName = (row: WaitingPatient) =>
  [row.lastName, row.postName, row.firstName].filter(Boolean).join(' ');

function cleanServiceLabel(value: string) {
  return (
    value
      .replace(/\s+(?:avec\s+)?consultations?\s+inclus(?:e|es)?\s+dans\s+la\s+fiche\s+mensuelle/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Consultation'
  );
}

function waitingLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'Moins d’une minute';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

export default function DoctorWaitingRoomPage() {
  const router = useRouter();
  const [rows, setRows] = useState<WaitingPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [acceptingId, setAcceptingId] = useState('');
  const [transferring, setTransferring] = useState<WaitingPatient | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api<WaitingPatient[]>('/clinical-safety/doctor-queue');
      setRows(result);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Salle d’attente indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const polling = window.setInterval(() => void load(), 15_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(polling);
      window.clearInterval(clock);
    };
  }, [load]);

  const queue = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            triageRank[a.triageLevel] - triageRank[b.triageLevel] ||
            new Date(a.arrivedAt).getTime() - new Date(b.arrivedAt).getTime(),
        )
        .map((row, index) => ({
          ...row,
          position: index + 1,
          waitingSeconds: Math.max(
            Math.floor((now - new Date(row.arrivedAt).getTime()) / 1000),
            0,
          ),
        })),
    [rows, now],
  );

  const accept = async (row: WaitingPatient) => {
    setAcceptingId(row.id);
    try {
      await api(`/appointments/${row.id}/acknowledge`, { method: 'PATCH' });
      notifySuccess(`${patientName(row)} est maintenant en consultation.`, 'Patient reçu');
      setRows((current) => current.filter((item) => item.id !== row.id));
      router.push(`/consultations?appointmentId=${encodeURIComponent(row.id)}`);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Impossible de recevoir le patient.');
    } finally {
      setAcceptingId('');
    }
  };

  const openTransfer = async (row: WaitingPatient) => {
    setTransferring(row);
    setDoctorId('');
    setTransferReason('');
    try {
      setDoctors(await api<Doctor[]>('/appointments/doctors/availability'));
    } catch (reason) {
      setTransferring(null);
      notifyError(reason instanceof Error ? reason.message : 'Médecins indisponibles.');
    }
  };

  const transfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!transferring || !doctorId) return;
    setSubmitting(true);
    try {
      await api(`/appointments/${transferring.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({
          doctorId,
          reason: transferReason.trim() || 'Réorientation depuis la salle d’attente',
        }),
      });
      notifySuccess('Le patient a été transféré dans la file du nouveau médecin.');
      setRows((current) => current.filter((item) => item.id !== transferring.id));
      setTransferring(null);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Transfert impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">File médicale en temps réel</span>
          <h1>Salle d’attente du médecin</h1>
          <p>Classement par priorité clinique, puis par heure réelle d’arrivée.</p>
        </div>
        <div className="waiting-room-heading-count">
          <UserRoundCheck size={22} />
          <strong>{queue.length}</strong>
          <span>en attente</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel doctor-queue-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Ordre de passage</span>
            <h2>File actuelle</h2>
          </div>
          <Clock3 size={22} />
        </div>

        {loading ? (
          <div className="empty-state">
            <Activity className="spin" /> Chargement de la file…
          </div>
        ) : queue.length === 0 ? (
          <div className="empty-state">
            <Stethoscope />
            <strong>Aucun patient en attente</strong>
            <span>La file se met à jour automatiquement.</span>
          </div>
        ) : (
          <div className="doctor-queue-table">
            <div className="doctor-queue-table-head" aria-hidden="true">
              <span>Position</span>
              <span>Patient</span>
              <span>Arrivée</span>
              <span>Priorité</span>
              <span>Actions</span>
            </div>
            <div className="doctor-queue-list">
              {queue.map((row) => (
                <article
                  className={`doctor-queue-card${row.position === 1 ? ' next' : ''} triage-${row.triageLevel.toLowerCase()}`}
                  key={row.id}
                >
                  <div className="doctor-queue-position">
                    <strong>{row.position}</strong>
                  </div>
                  <div className="doctor-queue-patient">
                    <strong>{patientName(row)}</strong>
                    <span>{row.medicalRecordNumber}</span>
                    <small>
                      {cleanServiceLabel(row.service)}
                      {row.chiefComplaint ? ` · ${row.chiefComplaint}` : ''}
                    </small>
                  </div>
                  <div className="doctor-queue-time">
                    <strong>{formatArrival(row.arrivedAt)}</strong>
                    <small>{waitingLabel(row.waitingSeconds)} d’attente</small>
                  </div>
                  <div className="doctor-queue-status">
                    <span className={`triage-chip triage-${row.triageLevel.toLowerCase()}`}>
                      <Siren size={14} /> {triageLabel[row.triageLevel]}
                    </span>
                    <StatusBadge status={row.journeyStage} />
                    <small>
                      {[row.doctorLastName, row.doctorPostName, row.doctorFirstName]
                        .filter(Boolean)
                        .join(' ')}{' '}
                      · {row.specialty}
                    </small>
                  </div>
                  <div className="row-actions doctor-queue-actions">
                    <button
                      type="button"
                      className="primary-button compact"
                      disabled={acceptingId === row.id}
                      onClick={() => void accept(row)}
                    >
                      <Stethoscope size={16} />
                      {acceptingId === row.id ? 'Ouverture…' : 'Recevoir'}
                    </button>
                    <button
                      type="button"
                      className="secondary-button compact"
                      onClick={() => void openTransfer(row)}
                    >
                      <ArrowRightLeft size={16} /> Transférer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {transferring && (
        <Modal
          title={`Transférer ${transferring.medicalRecordNumber}`}
          eyebrow="Réorientation médicale"
          onClose={() => setTransferring(null)}
        >
          <form onSubmit={transfer}>
            <div className="form-grid">
              <label className="field full">
                <span>Nouveau médecin *</span>
                <select required value={doctorId} onChange={(event) => setDoctorId(event.target.value)}>
                  <option value="">Sélectionner un médecin</option>
                  {doctors
                    .filter((doctor) => doctor.id !== transferring.doctorId)
                    .map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name} — {doctor.specialty} —{' '}
                        {doctor.availability === 'AVAILABLE'
                          ? 'Disponible'
                          : doctor.availability === 'BUSY'
                            ? 'Occupé'
                            : 'Hors service'}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field full">
                <span>Motif du transfert</span>
                <textarea
                  rows={3}
                  value={transferReason}
                  onChange={(event) => setTransferReason(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setTransferring(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || !doctorId}>
                Confirmer le transfert
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
