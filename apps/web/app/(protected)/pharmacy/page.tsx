'use client';

import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  PackageCheck,
  Plus,
  Printer,
  Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface Medication {
  id: string;
  code: string;
  name: string;
  form?: string;
  strength?: string;
  stockQuantity: number;
  minimumStock: number;
  unitPrice: string;
}
interface CareAuthorization {
  id: string;
  patientId: string;
  patient: Patient;
  medicationId: string;
  quantity: number;
}
interface Prescription {
  id: string;
  number: string;
  status: string;
  prescribedAt: string;
  patient: Patient;
  invoice?: { number: string; status: string };
  paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
  items: Array<{
    id: string;
    quantity: number;
    dispensedQuantity: number;
    dosage: string;
    frequency: string;
    medicationId?: string;
    medicationName: string;
    availability: string;
    externalReason?: string;
    medication?: Medication | null;
  }>;
}
const emptyMedication = {
  code: '',
  name: '',
  form: '',
  strength: '',
  minimumStock: '5',
  unitPrice: '0',
};
const emptyMovement = { type: 'ENTRY', quantity: '', reason: '', reference: '' };

export default function PharmacyPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Medication[]>([]);
  const [authorizations, setAuthorizations] = useState<CareAuthorization[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [movementFor, setMovementFor] = useState<Medication | null>(null);
  const [dispensingFor, setDispensingFor] = useState<Medication | null>(null);
  const [dispenseAuthorizationId, setDispenseAuthorizationId] = useState('');
  const [medication, setMedication] = useState(emptyMedication);
  const [movement, setMovement] = useState(emptyMovement);
  const [submitting, setSubmitting] = useState(false);
  const [prescriptionQuery, setPrescriptionQuery] = useState('');
  const [medicationQuery, setMedicationQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [medicationRows, paidRows, waivedRows, prescriptionRows] = await Promise.all([
        api<Medication[]>('/pharmacy/medications'),
        api<CareAuthorization[]>('/billing/authorizations?type=PHARMACY&status=AUTHORIZED'),
        api<CareAuthorization[]>('/billing/authorizations?type=PHARMACY&status=WAIVED'),
        api<Prescription[]>('/enterprise/prescriptions'),
      ]);
      setItems(medicationRows);
      setAuthorizations([...paidRows, ...waivedRows]);
      setPrescriptions(prescriptionRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/pharmacy/medications', {
        method: 'POST',
        body: JSON.stringify({
          ...medication,
          minimumStock: Number(medication.minimumStock),
          unitPrice: Number(medication.unitPrice),
        }),
      });
      setAddOpen(false);
      setMedication(emptyMedication);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Création impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const move = async (e: FormEvent) => {
    e.preventDefault();
    if (!movementFor) return;
    setSubmitting(true);
    try {
      await api(`/pharmacy/medications/${movementFor.id}/movements`, {
        method: 'POST',
        body: JSON.stringify({ ...movement, quantity: Number(movement.quantity) }),
      });
      setMovementFor(null);
      setMovement(emptyMovement);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Mouvement impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const canMove = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'STOREKEEPER']);
  const canDispensePrescription = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST']);
  const dispensePrescription = async (id: string) => {
    setSubmitting(true);
    try {
      await api(`/enterprise/prescriptions/${id}/dispense`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Ordonnance impossible à délivrer.');
    } finally {
      setSubmitting(false);
    }
  };
  const dispense = async (e: FormEvent) => {
    e.preventDefault();
    if (!dispensingFor) return;
    const authorization = authorizations.find((entry) => entry.id === dispenseAuthorizationId);
    if (!authorization) return;
    setSubmitting(true);
    try {
      await api(`/pharmacy/medications/${dispensingFor.id}/dispense`, {
        method: 'POST',
        body: JSON.stringify({
          patientId: authorization.patientId,
          authorizationId: authorization.id,
          quantity: authorization.quantity,
        }),
      });
      setDispensingFor(null);
      setDispenseAuthorizationId('');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Délivrance impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const filteredPrescriptions = prescriptions.filter(
    (row) =>
      ['ACTIVE', 'PARTIALLY_DISPENSED'].includes(row.status) &&
      matchesSearch(
        prescriptionQuery,
        row.number,
        patientName(row.patient),
        row.patient.medicalRecordNumber,
        row.invoice?.number,
        row.items.map((item) => item.medicationName || item.medication?.name || '').join(' '),
      ),
  );
  const filteredMedications = items.filter(
    (row) =>
      (stockFilter !== 'LOW' || row.stockQuantity <= row.minimumStock) &&
      (stockFilter !== 'AVAILABLE' || row.stockQuantity > 0) &&
      (stockFilter !== 'OUT' || row.stockQuantity === 0) &&
      matchesSearch(medicationQuery, row.code, row.name, row.form, row.strength),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Médicaments</span>
          <h1>Pharmacie</h1>
          <p>Inventaire, ventes payées et mouvements de stock traçables.</p>
        </div>
        {hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST']) && (
          <button className="primary-button" onClick={() => setAddOpen(true)}>
            <Plus size={18} />
            Nouveau médicament
          </button>
        )}
      </div>
      {error && <div className="alert error">{error}</div>}
      <section className="panel table-panel prescription-dispensary">
        <div className="panel-toolbar">
          <div>
            <strong>Ordonnances structurées à délivrer</strong>
            <span>La caisse confirme le paiement avant la remise des médicaments disponibles.</span>
          </div>
          <Stethoscope size={22} />
        </div>
        <ListFilters
          query={prescriptionQuery}
          onQueryChange={setPrescriptionQuery}
          placeholder="Ordonnance, patient, dossier ou médicament…"
          resultCount={filteredPrescriptions.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ordonnance</th>
                <th>Patient</th>
                <th>Médicaments</th>
                <th>Paiement</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPrescriptions.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.number}</strong>
                    <br />
                    <span className="muted">
                      {new Date(row.prescribedAt).toLocaleDateString('fr-FR')}
                    </span>
                  </td>
                  <td>
                    {patientName(row.patient)}
                    <br />
                    <span className="muted">{row.patient.medicalRecordNumber}</span>
                  </td>
                  <td>
                    {row.items.map((item) => {
                      const remaining = item.quantity - item.dispensedQuantity;
                      const internal =
                        item.availability === 'INTERNAL' || item.availability === 'PARTIAL';
                      const available = Boolean(
                        internal && item.medication && item.medication.stockQuantity >= remaining,
                      );
                      return (
                        <div
                          key={item.id}
                          className={internal && !available ? 'stock-unavailable' : ''}
                        >
                          {item.medicationName || item.medication?.name || 'Médicament'} —{' '}
                          {item.dosage}, {item.frequency} · {remaining} unité(s)
                          {!internal && ' · achat extérieur (aucune sortie de stock)'}
                          {internal && !available && ' · stock insuffisant'}
                        </div>
                      );
                    })}
                  </td>
                  <td>
                    {row.invoice?.number ||
                      (row.paymentClearance?.inOrder
                        ? 'Paiement en ordre'
                        : 'Paiement à régulariser')}
                    <br />
                    <StatusBadge
                      status={
                        row.invoice?.status || row.paymentClearance?.status || 'TO_REGULARIZE'
                      }
                    />
                  </td>
                  <td>
                    <div className="row-actions">
                      {canDispensePrescription && (
                        <button
                          className="text-button"
                          disabled={submitting}
                          onClick={() => void dispensePrescription(row.id)}
                        >
                          <PackageCheck size={15} /> Délivrer après paiement
                        </button>
                      )}
                      <Link
                        className="text-button"
                        href={`/print?kind=prescription&id=${row.id}`}
                        target="_blank"
                      >
                        <Printer size={14} /> Ordonnance
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && filteredPrescriptions.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-state">
                    Aucune ordonnance en attente de délivrance.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel table-panel">
        <ListFilters
          query={medicationQuery}
          onQueryChange={setMedicationQuery}
          placeholder="Code, médicament, forme ou dosage…"
          status={stockFilter}
          onStatusChange={setStockFilter}
          allLabel="Tous les niveaux de stock"
          statusOptions={[
            { value: 'AVAILABLE', label: 'En stock' },
            { value: 'LOW', label: 'Stock faible' },
            { value: 'OUT', label: 'Rupture de stock' },
          ]}
          resultCount={filteredMedications.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Médicament</th>
                <th>Présentation</th>
                <th>Stock</th>
                <th>Seuil</th>
                <th>Prix unitaire</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Activity className="spin" />
                      Chargement…
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMedications.map((row) => {
                  const low = row.stockQuantity <= row.minimumStock;
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className="record-number">{row.code}</span>
                      </td>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{[row.form, row.strength].filter(Boolean).join(' — ') || '—'}</td>
                      <td>
                        <span className={low ? 'stock-count low' : 'stock-count'}>
                          {low && <AlertTriangle size={14} />} {row.stockQuantity}
                        </span>
                      </td>
                      <td>{row.minimumStock}</td>
                      <td>{currency(row.unitPrice)}</td>
                      <td>
                        {canMove && (
                          <div className="row-actions">
                            <button className="text-button" onClick={() => setDispensingFor(row)}>
                              <PackageCheck size={15} />
                              Délivrer payé
                            </button>
                            <button className="text-button" onClick={() => setMovementFor(row)}>
                              <ArrowDownUp size={15} />
                              Inventaire
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      {addOpen && (
        <Modal title="Ajouter un médicament" eyebrow="Catalogue" onClose={() => setAddOpen(false)}>
          <form onSubmit={create}>
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={medication.code}
                  onChange={(e) => setMedication({ ...medication, code: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Nom *</span>
                <input
                  required
                  value={medication.name}
                  onChange={(e) => setMedication({ ...medication, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Forme</span>
                <input
                  placeholder="Comprimé, sirop…"
                  value={medication.form}
                  onChange={(e) => setMedication({ ...medication, form: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Dosage</span>
                <input
                  placeholder="500 mg"
                  value={medication.strength}
                  onChange={(e) => setMedication({ ...medication, strength: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Seuil minimal *</span>
                <input
                  type="number"
                  min="0"
                  required
                  value={medication.minimumStock}
                  onChange={(e) => setMedication({ ...medication, minimumStock: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Prix unitaire *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={medication.unitPrice}
                  onChange={(e) => setMedication({ ...medication, unitPrice: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setAddOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
      {movementFor && (
        <Modal
          title={`Stock — ${movementFor.name}`}
          eyebrow="Mouvement"
          onClose={() => setMovementFor(null)}
        >
          <form onSubmit={move}>
            <div className="form-grid">
              <label className="field">
                <span>Type *</span>
                <select
                  value={movement.type}
                  onChange={(e) => setMovement({ ...movement, type: e.target.value })}
                >
                  <option value="ENTRY">Entrée</option>
                  <option value="ADJUSTMENT">Ajustement</option>
                </select>
              </label>
              <label className="field">
                <span>Quantité *</span>
                <input
                  type="number"
                  required
                  value={movement.quantity}
                  onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}
                />
              </label>
              <label className="field full">
                <span>Motif *</span>
                <input
                  required
                  value={movement.reason}
                  onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
                />
              </label>
              <label className="field full">
                <span>Référence</span>
                <input
                  value={movement.reference}
                  onChange={(e) => setMovement({ ...movement, reference: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setMovementFor(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Valider le mouvement
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dispensingFor && (
        <Modal
          title={`Délivrer — ${dispensingFor.name}`}
          eyebrow="Vente payée"
          onClose={() => setDispensingFor(null)}
        >
          <form onSubmit={dispense}>
            <label className="field">
              <span>Paiement validé *</span>
              <select
                required
                value={dispenseAuthorizationId}
                onChange={(e) => setDispenseAuthorizationId(e.target.value)}
              >
                <option value="">Sélectionner</option>
                {authorizations
                  .filter((entry) => entry.medicationId === dispensingFor.id)
                  .map((authorization) => (
                    <option value={authorization.id} key={authorization.id}>
                      {patientName(authorization.patient)} — quantité {authorization.quantity} —
                      paiement validé
                    </option>
                  ))}
              </select>
              <small>Seules les ventes intégralement payées ou dérogées sont disponibles.</small>
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setDispensingFor(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || !dispenseAuthorizationId}>
                Confirmer la délivrance
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
