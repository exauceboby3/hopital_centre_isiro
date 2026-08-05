'use client';

import {
  Activity,
  Ban,
  CheckCircle2,
  PauseCircle,
  Plus,
  TicketCheck,
  WalletCards,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, matchesSearch, patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface VoucherCoverage {
  id: string;
  status: string;
  sponsorAmount: string;
  patientAmount: string;
  createdAt: string;
  invoice: {
    id: string;
    number: string;
    total: string;
    status: string;
  };
}

interface CareVoucher {
  id: string;
  number: string;
  issuerName: string;
  coveragePercent: string;
  ceilingAmount?: string;
  usedAmount: string;
  validFrom?: string;
  validUntil?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXHAUSTED' | 'EXPIRED' | 'CANCELLED';
  notes?: string;
  createdAt: string;
  patient: Patient;
  createdBy: { username: string };
  coverages: VoucherCoverage[];
}

const emptyVoucher = {
  patientId: '',
  number: '',
  issuerName: '',
  coveragePercent: '100',
  ceilingAmount: '',
  validFrom: '',
  validUntil: '',
  notes: '',
};

function dateLabel(value?: string) {
  return value ? new Intl.DateTimeFormat('fr-FR').format(new Date(value)) : 'Non limitée';
}

function remainingAmount(voucher: CareVoucher) {
  if (!voucher.ceilingAmount) return null;
  return Math.max(0, Number(voucher.ceilingAmount) - Number(voucher.usedAmount));
}

export default function CareVouchersPage() {
  const { user } = useAuth();
  const authorized = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canManageStatus = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);
  const [vouchers, setVouchers] = useState<CareVoucher[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<CareVoucher | null>(null);
  const [form, setForm] = useState(emptyVoucher);

  const load = useCallback(async () => {
    if (!authorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [voucherRows, patientRows] = await Promise.all([
        api<CareVoucher[]>('/billing/vouchers'),
        api<{ items: Patient[] }>('/patients/lookup?limit=200'),
      ]);
      setVouchers(voucherRows);
      setPatients(patientRows.items);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Chargement des bons impossible.');
    } finally {
      setLoading(false);
    }
  }, [authorized]);

  useEffect(() => {
    void load();
  }, [load]);

  const close = () => {
    setOpen(false);
    setForm(emptyVoucher);
  };

  const createVoucher = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api('/billing/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          coveragePercent: Number(form.coveragePercent),
          ceilingAmount: form.ceilingAmount ? Number(form.ceilingAmount) : undefined,
          validFrom: form.validFrom || undefined,
          validUntil: form.validUntil || undefined,
          notes: form.notes || undefined,
        }),
      });
      close();
      notifySuccess(
        'Le bon de soins est enregistré et peut maintenant être appliqué aux factures du patient.',
        'Bon de soins créé',
      );
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Création du bon impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (
    voucher: CareVoucher,
    nextStatus: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED',
  ) => {
    const action =
      nextStatus === 'ACTIVE' ? 'réactiver' : nextStatus === 'SUSPENDED' ? 'suspendre' : 'annuler';
    if (!window.confirm(`Confirmer : ${action} le bon ${voucher.number} ?`)) return;
    try {
      await api(`/billing/vouchers/${voucher.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      notifySuccess(`Le bon ${voucher.number} a été mis à jour.`, 'Statut enregistré');
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Modification du statut impossible.');
    }
  };

  const filtered = useMemo(
    () =>
      vouchers.filter(
        (voucher) =>
          (!status || voucher.status === status) &&
          matchesSearch(
            query,
            voucher.number,
            voucher.issuerName,
            voucher.status,
            patientName(voucher.patient),
            voucher.patient.medicalRecordNumber,
            voucher.notes,
          ),
      ),
    [query, status, vouchers],
  );

  const activeCount = vouchers.filter((voucher) => voucher.status === 'ACTIVE').length;
  const sponsoredTotal = vouchers.reduce(
    (sum, voucher) =>
      sum +
      voucher.coverages
        .filter((coverage) => coverage.status !== 'CANCELLED')
        .reduce((coverageSum, coverage) => coverageSum + Number(coverage.sponsorAmount), 0),
    0,
  );

  if (!authorized) {
    return (
      <section className="panel restricted">
        <TicketCheck size={38} />
        <h1>Accès aux bons de soins réservé</h1>
        <p>
          Ce module est accessible à la réception, au secrétariat, à la caisse et à la comptabilité.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Prise en charge par organisme</span>
          <h1>Bons de soins</h1>
          <p>Création, validité, plafond et utilisation des bons de prise en charge.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setOpen(true)}>
          <Plus size={18} /> Nouveau bon
        </button>
      </div>

      <section className="stats-grid compact-stats">
        <article>
          <span>Bons actifs</span>
          <strong>{activeCount}</strong>
        </article>
        <article>
          <span>Total des bons</span>
          <strong>{vouchers.length}</strong>
        </article>
        <article>
          <span>Montant pris en charge</span>
          <strong>{currency(sponsoredTotal)}</strong>
        </article>
        <article>
          <span>Bons épuisés</span>
          <strong>{vouchers.filter((voucher) => voucher.status === 'EXHAUSTED').length}</strong>
        </article>
      </section>

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Numéro, patient, dossier ou organisme…"
          status={status}
          onStatusChange={setStatus}
          statusOptions={[
            { value: 'ACTIVE', label: 'Actif' },
            { value: 'SUSPENDED', label: 'Suspendu' },
            { value: 'EXHAUSTED', label: 'Épuisé' },
            { value: 'EXPIRED', label: 'Expiré' },
            { value: 'CANCELLED', label: 'Annulé' },
          ]}
          resultCount={filtered.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bon</th>
                <th>Patient</th>
                <th>Organisme</th>
                <th>Couverture</th>
                <th>Plafond</th>
                <th>Validité</th>
                <th>Utilisations</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <Activity className="spin" /> Chargement…
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <TicketCheck />
                      <strong>Aucun bon de soins</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((voucher) => {
                  const remaining = remainingAmount(voucher);
                  return (
                    <tr
                      className="clickable-row"
                      key={voucher.id}
                      onClick={() => setSelected(voucher)}
                    >
                      <td>
                        <span className="record-number">{voucher.number}</span>
                        <br />
                        <span className="muted">Créé par {voucher.createdBy.username}</span>
                      </td>
                      <td>
                        <strong>{patientName(voucher.patient)}</strong>
                        <br />
                        <span className="muted">{voucher.patient.medicalRecordNumber}</span>
                      </td>
                      <td>{voucher.issuerName}</td>
                      <td>{Number(voucher.coveragePercent).toLocaleString('fr-FR')} %</td>
                      <td>
                        {voucher.ceilingAmount ? (
                          <>
                            <strong>{currency(remaining ?? 0)}</strong>
                            <br />
                            <span className="muted">
                              utilisé {currency(voucher.usedAmount)} /{' '}
                              {currency(voucher.ceilingAmount)}
                            </span>
                          </>
                        ) : (
                          'Sans plafond'
                        )}
                      </td>
                      <td>
                        {voucher.validFrom
                          ? `Du ${dateLabel(voucher.validFrom)}`
                          : 'Début immédiat'}
                        <br />
                        <span className="muted">
                          {voucher.validUntil
                            ? `Au ${dateLabel(voucher.validUntil)}`
                            : 'Sans expiration'}
                        </span>
                      </td>
                      <td>
                        {
                          voucher.coverages.filter((coverage) => coverage.status !== 'CANCELLED')
                            .length
                        }
                      </td>
                      <td>
                        <StatusBadge status={voucher.status} />
                      </td>
                      <td onClick={(event) => event.stopPropagation()}>
                        <div className="row-actions">
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => setSelected(voucher)}
                          >
                            <WalletCards size={14} /> Détails
                          </button>
                          {canManageStatus && voucher.status === 'ACTIVE' && (
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => void updateStatus(voucher, 'SUSPENDED')}
                            >
                              <PauseCircle size={14} /> Suspendre
                            </button>
                          )}
                          {canManageStatus && voucher.status === 'SUSPENDED' && (
                            <button
                              className="text-button"
                              type="button"
                              onClick={() => void updateStatus(voucher, 'ACTIVE')}
                            >
                              <CheckCircle2 size={14} /> Réactiver
                            </button>
                          )}
                          {canManageStatus && ['ACTIVE', 'SUSPENDED'].includes(voucher.status) && (
                            <button
                              className="text-button danger"
                              type="button"
                              onClick={() => void updateStatus(voucher, 'CANCELLED')}
                            >
                              <Ban size={14} /> Annuler
                            </button>
                          )}
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

      {open && (
        <Modal title="Créer un bon de soins" eyebrow="Prise en charge" onClose={close} wide>
          <form onSubmit={createVoucher}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient bénéficiaire"
                value={form.patientId}
                onChange={(patientId) => setForm({ ...form, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
              <label className="field">
                <span>Numéro du bon *</span>
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.number}
                  onChange={(event) => setForm({ ...form, number: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Organisme émetteur *</span>
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={form.issuerName}
                  onChange={(event) => setForm({ ...form, issuerName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Pourcentage couvert *</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={form.coveragePercent}
                  onChange={(event) => setForm({ ...form, coveragePercent: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Plafond total (CDF)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.ceilingAmount}
                  onChange={(event) => setForm({ ...form, ceilingAmount: event.target.value })}
                />
                <small>Laissez vide lorsque le bon ne possède pas de plafond monétaire.</small>
              </label>
              <label className="field">
                <span>Date de début</span>
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={(event) => setForm({ ...form, validFrom: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Date d’expiration</span>
                <input
                  type="date"
                  min={form.validFrom || undefined}
                  value={form.validUntil}
                  onChange={(event) => setForm({ ...form, validUntil: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Conditions et services couverts</span>
                <textarea
                  rows={4}
                  maxLength={1000}
                  placeholder="Exemple : consultations, laboratoire et hospitalisation, hors médicaments…"
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="alert info">
              Le bon pourra être appliqué depuis la facture du patient avant le premier
              encaissement. Le système calculera automatiquement la part du patient et celle de
              l’organisme.
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={close}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || !form.patientId}>
                Enregistrer le bon
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal
          title={selected.number}
          eyebrow={`${patientName(selected.patient)} — ${selected.issuerName}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="coverage-preview">
            <span>
              Couverture{' '}
              <strong>{Number(selected.coveragePercent).toLocaleString('fr-FR')} %</strong>
            </span>
            <span>
              Montant utilisé <strong>{currency(selected.usedAmount)}</strong>
            </span>
            <span>
              Solde du plafond{' '}
              <strong>
                {selected.ceilingAmount ? currency(remainingAmount(selected) ?? 0) : 'Sans plafond'}
              </strong>
            </span>
          </div>
          {selected.notes && (
            <section className="panel compact-panel">
              <strong>Conditions du bon</strong>
              <p>{selected.notes}</p>
            </section>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Total</th>
                  <th>Part organisme</th>
                  <th>Part patient</th>
                  <th>Date</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {selected.coverages.map((coverage) => (
                  <tr key={coverage.id}>
                    <td>{coverage.invoice.number}</td>
                    <td>{currency(coverage.invoice.total)}</td>
                    <td>{currency(coverage.sponsorAmount)}</td>
                    <td>{currency(coverage.patientAmount)}</td>
                    <td>{dateLabel(coverage.createdAt)}</td>
                    <td>
                      <StatusBadge status={coverage.status} />
                    </td>
                  </tr>
                ))}
                {selected.coverages.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state">
                        Ce bon n’a encore été appliqué à aucune facture.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={() => setSelected(null)}>
              Fermer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
