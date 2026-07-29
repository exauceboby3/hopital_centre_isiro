'use client';

import { Activity, BedDouble, DoorOpen, Plus } from 'lucide-react';
import Link from 'next/link';
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
interface Stay {
  id: string;
  reason: string;
  status: string;
  admittedAt: string;
  patient: Patient;
  bed: Bed & { room: Room };
  doctor?: { lastName: string; postName?: string; firstName?: string };
  careAuthorization?: { status: string; invoice: { number: string } };
}
interface CareAuthorization {
  id: string;
  patientId: string;
  patient: Patient;
  status: string;
  description: string;
  invoice: { number: string };
}
const emptyAdmit = {
  patientId: '',
  authorizationId: '',
  bedId: '',
  reason: '',
  expectedDischargeAt: '',
};
const emptyRoom = { code: '', name: '', service: '', bedCodes: '1, 2' };

export default function HospitalizationsPage() {
  const { user } = useAuth();
  const [stays, setStays] = useState<Stay[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [authorizations, setAuthorizations] = useState<CareAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [admitOpen, setAdmitOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [transferFor, setTransferFor] = useState<Stay | null>(null);
  const [transferBedId, setTransferBedId] = useState('');
  const [admit, setAdmit] = useState(emptyAdmit);
  const [room, setRoom] = useState(emptyRoom);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stayRows, roomRows, paidRows, waivedRows] = await Promise.all([
        api<Stay[]>('/hospitalizations'),
        api<Room[]>('/hospitalizations/rooms'),
        api<CareAuthorization[]>('/billing/authorizations?type=HOSPITALIZATION&status=AUTHORIZED'),
        api<CareAuthorization[]>('/billing/authorizations?type=HOSPITALIZATION&status=WAIVED'),
      ]);
      setStays(stayRows);
      setRooms(roomRows);
      setAuthorizations([...paidRows, ...waivedRows]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const beds = useMemo(
    () =>
      rooms.flatMap((r) =>
        r.beds.filter((b) => b.status === 'AVAILABLE').map((b) => ({ ...b, room: r })),
      ),
    [rooms],
  );
  const canManage = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'MIDWIFE']);
  const admitPatient = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/hospitalizations', {
        method: 'POST',
        body: JSON.stringify({
          ...admit,
          expectedDischargeAt: admit.expectedDischargeAt
            ? new Date(admit.expectedDischargeAt).toISOString()
            : undefined,
        }),
      });
      setAdmitOpen(false);
      setAdmit(emptyAdmit);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Admission impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const createRoom = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/hospitalizations/rooms', {
        method: 'POST',
        body: JSON.stringify({
          ...room,
          bedCodes: room.bedCodes
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      });
      setRoomOpen(false);
      setRoom(emptyRoom);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Création impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const discharge = async (id: string) => {
    try {
      await api(`/hospitalizations/${id}/discharge`, { method: 'PATCH' });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Sortie impossible.');
    }
  };
  const transfer = async (e: FormEvent) => {
    e.preventDefault();
    if (!transferFor) return;
    setSubmitting(true);
    try {
      await api(`/hospitalizations/${transferFor.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({ bedId: transferBedId }),
      });
      setTransferFor(null);
      setTransferBedId('');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Déplacement impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const filteredStays = stays.filter(
    (row) =>
      (!statusFilter || row.status === statusFilter) &&
      matchesSearch(
        query,
        patientName(row.patient),
        row.patient.medicalRecordNumber,
        row.reason,
        row.bed.room.code,
        row.bed.room.name,
        row.bed.code,
        row.doctor ? patientName(row.doctor) : '',
        row.careAuthorization?.invoice.number,
      ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Séjour patient</span>
          <h1>Hospitalisations</h1>
          <p>Chambres, lits, admissions et sorties.</p>
        </div>
        <div className="heading-actions">
          {hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']) && (
            <button className="secondary-button" onClick={() => setRoomOpen(true)}>
              <DoorOpen size={18} />
              Nouvelle chambre
            </button>
          )}
          {canManage && (
            <button className="primary-button" onClick={() => setAdmitOpen(true)}>
              <Plus size={18} />
              Admettre un patient
            </button>
          )}
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="room-summary">
        {rooms.map((r) => (
          <article className="panel room-card" key={r.id}>
            <div>
              <strong>
                {r.code} — {r.name}
              </strong>
              <span>{r.service || 'Tous services'}</span>
            </div>
            <div className="bed-dots">
              {r.beds.map((b) => (
                <span
                  key={b.id}
                  className={`bed-dot ${b.status.toLowerCase()}`}
                  title={`${b.code}: ${b.status}`}
                >
                  {b.code}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Patient, dossier, chambre, lit ou médecin…"
          status={statusFilter}
          onStatusChange={setStatusFilter}
          statusOptions={[
            { value: 'ACTIVE', label: 'Hospitalisé' },
            { value: 'DISCHARGED', label: 'Sorti' },
            { value: 'TRANSFERRED', label: 'Transféré' },
            { value: 'CANCELLED', label: 'Annulé' },
          ]}
          resultCount={filteredStays.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Admission</th>
                <th>Patient</th>
                <th>Chambre / lit</th>
                <th>Médecin</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Paiement</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Activity className="spin" />
                      Chargement…
                    </div>
                  </td>
                </tr>
              ) : filteredStays.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <BedDouble />
                      <strong>Aucune hospitalisation</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStays.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Intl.DateTimeFormat('fr-FR', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(row.admittedAt))}
                    </td>
                    <td>
                      <strong>{patientName(row.patient)}</strong>
                      <br />
                      <span className="muted">{row.patient.medicalRecordNumber}</span>
                    </td>
                    <td>
                      {row.bed.room.code} / {row.bed.code}
                    </td>
                    <td>{row.doctor ? patientName(row.doctor) : '—'}</td>
                    <td>{row.reason}</td>
                    <td>
                      <StatusBadge status={row.status} />
                    </td>
                    <td>
                      {row.careAuthorization ? (
                        <>
                          <StatusBadge status={row.careAuthorization.status} />
                          <br />
                          <span className="muted">{row.careAuthorization.invoice.number}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {canManage && row.status === 'ACTIVE' && (
                          <>
                            <button className="text-button" onClick={() => setTransferFor(row)}>
                              Déplacer
                            </button>
                            <button className="text-button" onClick={() => void discharge(row.id)}>
                              Enregistrer sortie
                            </button>
                            <Link className="text-button" href="/nursing">
                              Suivi infirmier
                            </Link>
                          </>
                        )}
                        <CustomFieldsEditor entity="HOSPITALIZATION" entityId={row.id} />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      {admitOpen && (
        <Modal
          title="Admettre un patient"
          eyebrow="Hospitalisation"
          onClose={() => setAdmitOpen(false)}
        >
          <form onSubmit={admitPatient}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Admission financièrement autorisée"
                value={admit.authorizationId}
                onChange={(authorizationId) => {
                  const authorization = authorizations.find(
                    (entry) => entry.id === authorizationId,
                  );
                  setAdmit({
                    ...admit,
                    authorizationId,
                    patientId: authorization?.patientId ?? '',
                  });
                }}
                options={authorizations.map((authorization) => ({
                  value: authorization.id,
                  label: patientName(authorization.patient),
                  description: `${authorization.invoice.number} · ${authorization.status}`,
                }))}
                helpText="La caisse doit encaisser la part patient ou valider la prise en charge avant l’admission."
              />
              <label className="field">
                <span>Lit disponible *</span>
                <select
                  required
                  value={admit.bedId}
                  onChange={(e) => setAdmit({ ...admit, bedId: e.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {beds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.room.code} — Lit {b.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sortie prévue</span>
                <input
                  type="datetime-local"
                  value={admit.expectedDischargeAt}
                  min={new Date().toISOString().slice(0, 10) + 'T00:00'}
                  onChange={(e) => setAdmit({ ...admit, expectedDischargeAt: e.target.value })}
                />
              </label>
              <label className="field full">
                <span>Motif *</span>
                <textarea
                  required
                  rows={4}
                  value={admit.reason}
                  onChange={(e) => setAdmit({ ...admit, reason: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAdmitOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Confirmer l’admission
              </button>
            </div>
          </form>
        </Modal>
      )}
      {roomOpen && (
        <Modal title="Créer une chambre" eyebrow="Capacité" onClose={() => setRoomOpen(false)}>
          <form onSubmit={createRoom}>
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={room.code}
                  onChange={(e) => setRoom({ ...room, code: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Nom *</span>
                <input
                  required
                  value={room.name}
                  onChange={(e) => setRoom({ ...room, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Service</span>
                <input
                  value={room.service}
                  onChange={(e) => setRoom({ ...room, service: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Codes des lits *</span>
                <input
                  required
                  value={room.bedCodes}
                  onChange={(e) => setRoom({ ...room, bedCodes: e.target.value })}
                />
                <small>Séparez les lits par des virgules.</small>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setRoomOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Créer la chambre
              </button>
            </div>
          </form>
        </Modal>
      )}
      {transferFor && (
        <Modal
          title={`Déplacer ${patientName(transferFor.patient)}`}
          eyebrow="Changement de lit"
          onClose={() => setTransferFor(null)}
        >
          <form onSubmit={transfer}>
            <label className="field">
              <span>Nouveau lit disponible *</span>
              <select
                required
                value={transferBedId}
                onChange={(e) => setTransferBedId(e.target.value)}
              >
                <option value="">Sélectionner</option>
                {beds.map((bed) => (
                  <option key={bed.id} value={bed.id}>
                    {bed.room.code} — Lit {bed.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTransferFor(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Confirmer le déplacement
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
