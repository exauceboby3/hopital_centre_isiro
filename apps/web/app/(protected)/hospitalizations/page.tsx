'use client';

import { Activity, BedDouble, DoorOpen, Plus, ShieldCheck, WalletCards } from 'lucide-react';
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
import { notifySuccess } from '@/lib/notifications';
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

interface FinancialStatus {
  billedDays?: number;
  total?: number;
  paid?: number;
  balance?: number;
  settled: boolean;
  settledByWaiver?: boolean;
  billingMissing?: boolean;
}

interface Stay {
  id: string;
  reason: string;
  status: string;
  admittedAt: string;
  medicalDischargeApprovedAt?: string | null;
  financialStatus: FinancialStatus;
  patient: Patient;
  bed: Bed & { room: Room };
  doctor?: { lastName: string; postName?: string; firstName?: string };
  careAuthorization?: {
    status: string;
    invoice?: { number: string; status: string; total?: string };
  };
}

interface CareAuthorization {
  id: string;
  patientId: string;
  patient: Patient;
  status: string;
  description: string;
  hospitalization?: { id: string } | null;
}

const emptyAdmit = {
  patientId: '',
  authorizationId: '',
  bedId: '',
  reason: '',
  expectedDischargeAt: '',
  notes: '',
};
const emptyRoom = { code: '', name: '', service: '', bedCodes: '1, 2' };
const money = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function HospitalizationsPage() {
  const { user } = useAuth();
  const [stays, setStays] = useState<Stay[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [authorizations, setAuthorizations] = useState<CareAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
      setAuthorizations(
        [...paidRows, ...waivedRows].filter((authorization) => !authorization.hospitalization),
      );
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const beds = useMemo(
    () =>
      rooms.flatMap((currentRoom) =>
        currentRoom.beds
          .filter((bed) => bed.status === 'AVAILABLE')
          .map((bed) => ({ ...bed, room: currentRoom })),
      ),
    [rooms],
  );

  const canManage = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
    'RECEPTIONIST',
    'SECRETARY',
    'NURSE',
  ]);
  const canApproveMedicalDischarge = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
  ]);
  const canCompleteAdministrativeDischarge = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'CASHIER',
    'ACCOUNTANT',
    'RECEPTIONIST',
    'SECRETARY',
  ]);
  const canViewFinancialDetails = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'CASHIER',
    'ACCOUNTANT',
  ]);

  const admitPatient = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
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
      const authorization = authorizations.find((entry) => entry.id === admit.authorizationId);
      setAdmitOpen(false);
      setAdmit(emptyAdmit);
      notifySuccess(
        `${authorization ? patientName(authorization.patient) : 'Le patient'} a été admis et le lit est désormais occupé.`,
        'Admission enregistrée',
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Admission impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const createRoom = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/hospitalizations/rooms', {
        method: 'POST',
        body: JSON.stringify({
          ...room,
          bedCodes: room.bedCodes
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });
      setRoomOpen(false);
      setRoom(emptyRoom);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Création impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const approveMedicalDischarge = async (stay: Stay) => {
    setError('');
    setNotice('');
    try {
      const result = await api<Stay>(`/hospitalizations/${stay.id}/medical-discharge`, {
        method: 'PATCH',
      });
      setNotice(
        result.financialStatus?.settled
          ? `La sortie médicale de ${patientName(stay.patient)} est validée. Le compte est soldé ; l’administration peut finaliser la sortie.`
          : `La sortie médicale de ${patientName(stay.patient)} est validée. Le paiement doit être régularisé avant la sortie administrative.`,
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Validation médicale impossible.');
    }
  };

  const completeAdministrativeDischarge = async (stay: Stay) => {
    setError('');
    setNotice('');
    try {
      await api(`/hospitalizations/${stay.id}/discharge`, { method: 'PATCH' });
      setNotice(
        `La sortie administrative de ${patientName(stay.patient)} est terminée. Le lit passe au circuit de nettoyage.`,
      );
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sortie administrative impossible.');
    }
  };

  const transfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!transferFor) return;
    setSubmitting(true);
    setError('');
    try {
      await api(`/hospitalizations/${transferFor.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({ bedId: transferBedId }),
      });
      setTransferFor(null);
      setTransferBedId('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Déplacement impossible.');
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
        row.careAuthorization?.invoice?.number,
      ),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Séjour patient</span>
          <h1>Hospitalisations</h1>
          <p>Admission, suivi, sortie médicale, règlement puis sortie administrative.</p>
        </div>
        <div className="heading-actions">
          {hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']) && (
            <button className="secondary-button" onClick={() => setRoomOpen(true)}>
              <DoorOpen size={18} /> Nouvelle chambre
            </button>
          )}
          {canManage && (
            <button className="primary-button" onClick={() => setAdmitOpen(true)}>
              <Plus size={18} /> Admettre un patient
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="room-summary">
        {rooms.map((currentRoom) => (
          <article className="panel room-card" key={currentRoom.id}>
            <div>
              <strong>
                {currentRoom.code} — {currentRoom.name}
              </strong>
              <span>{currentRoom.service || 'Tous services'}</span>
            </div>
            <div className="bed-dots">
              {currentRoom.beds.map((bed) => (
                <span
                  key={bed.id}
                  className={`bed-dot ${bed.status.toLowerCase()}`}
                  title={`${bed.code}: ${bed.status}`}
                >
                  {bed.code}
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
                <th>Chambre/lit</th>
                <th>Médecin</th>
                <th>Motif</th>
                <th>Statut clinique</th>
                <th>Compte du séjour</th>
                <th>Actions</th>
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
                      {row.bed.room.code}/{row.bed.code}
                    </td>
                    <td>{row.doctor ? patientName(row.doctor) : '—'}</td>
                    <td>{row.reason}</td>
                    <td>
                      <StatusBadge status={row.status} />
                      {row.medicalDischargeApprovedAt && row.status === 'ACTIVE' && (
                        <>
                          <br />
                          <small className="signed-record">
                            <ShieldCheck size={13} /> Sortie médicale validée
                          </small>
                        </>
                      )}
                    </td>
                    <td>
                      {row.careAuthorization && canViewFinancialDetails ? (
                        <div className="hospitalization-financial-summary">
                          <span>
                            {row.careAuthorization.invoice?.number ?? 'Facture à établir'}
                          </span>
                          <small>
                            {row.financialStatus.billedDays ?? 0} jour(s) · Total{' '}
                            {money.format(row.financialStatus.total ?? 0)}
                          </small>
                          <small>Payé {money.format(row.financialStatus.paid ?? 0)}</small>
                          <strong>
                            {row.financialStatus.settled
                              ? 'Compte soldé'
                              : `Solde ${money.format(row.financialStatus.balance ?? 0)}`}
                          </strong>
                        </div>
                      ) : (
                        <strong>
                          {row.financialStatus.settled
                            ? 'Paiement en ordre'
                            : 'Paiement à régulariser'}
                        </strong>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {canManage && row.status === 'ACTIVE' && (
                          <>
                            <button className="text-button" onClick={() => setTransferFor(row)}>
                              Déplacer
                            </button>
                            {canApproveMedicalDischarge && !row.medicalDischargeApprovedAt && (
                              <button
                                className="text-button"
                                onClick={() => void approveMedicalDischarge(row)}
                              >
                                Valider sortie médicale
                              </button>
                            )}
                            {canViewFinancialDetails &&
                              row.medicalDischargeApprovedAt &&
                              !row.financialStatus.settled && (
                                <Link className="text-button" href="/billing">
                                  <WalletCards size={15} /> Régler le compte
                                </Link>
                              )}
                            {canCompleteAdministrativeDischarge &&
                              row.medicalDischargeApprovedAt &&
                              row.financialStatus.settled && (
                                <button
                                  className="text-button"
                                  onClick={() => void completeAdministrativeDischarge(row)}
                                >
                                  Autoriser sortie administrative
                                </button>
                              )}
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
            <div className="payment-gate-notice hospitalization-deferred-billing-note">
              <BedDouble size={19} />
              <div>
                <strong>Patient orienté par le médecin</strong>
                <span>
                  Sélectionnez la demande médicale, attribuez un lit puis confirmez l’admission. La
                  facture du séjour sera finalisée lors de la validation médicale de sortie.
                </span>
              </div>
            </div>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient signalé pour hospitalisation"
                value={admit.authorizationId}
                onChange={(authorizationId) => {
                  const authorization = authorizations.find(
                    (entry) => entry.id === authorizationId,
                  );
                  setAdmit((current) => ({
                    ...current,
                    authorizationId,
                    patientId: authorization?.patientId ?? '',
                    reason:
                      authorization?.description ??
                      'Hospitalisation demandée par le médecin traitant.',
                  }));
                }}
                options={authorizations.map((authorization) => ({
                  value: authorization.id,
                  label: patientName(authorization.patient),
                  description: `${authorization.patient.medicalRecordNumber} · ${authorization.description} · ${authorization.status}`,
                }))}
                helpText={
                  authorizations.length
                    ? 'Sélectionnez la demande transmise par le médecin.'
                    : "Aucune nouvelle demande d'hospitalisation n'est disponible."
                }
              />
              <label className="field">
                <span>Lit disponible*</span>
                <select
                  required
                  value={admit.bedId}
                  onChange={(event) => setAdmit({ ...admit, bedId: event.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {beds.map((bed) => (
                    <option key={bed.id} value={bed.id}>
                      {bed.room.code} — Lit {bed.code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sortie prévue</span>
                <input
                  type="datetime-local"
                  value={admit.expectedDischargeAt}
                  min={`${new Date().toISOString().slice(0, 10)}T00:00`}
                  onChange={(event) =>
                    setAdmit({ ...admit, expectedDischargeAt: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Motif médical*</span>
                <textarea
                  required
                  rows={4}
                  value={admit.reason}
                  onChange={(event) => setAdmit({ ...admit, reason: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Consignes d’admission</span>
                <textarea
                  rows={3}
                  value={admit.notes}
                  onChange={(event) => setAdmit({ ...admit, notes: event.target.value })}
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
              <button
                className="primary-button"
                disabled={submitting || !authorizations.length || !beds.length}
              >
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
                <span>Code*</span>
                <input
                  required
                  value={room.code}
                  onChange={(event) => setRoom({ ...room, code: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Nom*</span>
                <input
                  required
                  value={room.name}
                  onChange={(event) => setRoom({ ...room, name: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Service</span>
                <input
                  value={room.service}
                  onChange={(event) => setRoom({ ...room, service: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Codes des lits*</span>
                <input
                  required
                  value={room.bedCodes}
                  onChange={(event) => setRoom({ ...room, bedCodes: event.target.value })}
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
              <span>Nouveau lit disponible*</span>
              <select
                required
                value={transferBedId}
                onChange={(event) => setTransferBedId(event.target.value)}
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
