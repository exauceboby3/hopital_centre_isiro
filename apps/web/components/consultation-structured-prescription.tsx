'use client';

import { Activity, Pill, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/notifications';

interface Medication {
  id: string;
  name: string;
  form?: string;
  strength?: string;
  stockQuantity: number;
  unitPrice?: string;
}

type PrescriptionAvailability = 'INTERNAL' | 'PARTIAL' | 'EXTERNAL' | 'NON_CATALOGUED';

export interface ConsultationPrescription {
  id: string;
  number: string;
  consultationId?: string;
  status: string;
  diagnosis?: string;
  generalInstructions?: string;
  invoice?: { id: string; number: string; status: string };
  paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
  items: Array<{
    id: string;
    medicationId?: string;
    medicationName: string;
    form?: string;
    strength?: string;
    availability: PrescriptionAvailability;
    externalReason?: string;
    dosage: string;
    frequency: string;
    route: string;
    durationDays: number;
    quantity: number;
    instructions?: string;
    medication?: Medication;
  }>;
}

interface PrescriptionItemForm {
  medicationId: string;
  medicationName: string;
  form: string;
  strength: string;
  availability: PrescriptionAvailability;
  externalReason: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: string;
  quantity: string;
  instructions: string;
}

interface ConsultationStructuredPrescriptionProps {
  consultationId: string;
  patientId: string;
  diagnosis?: string;
  existingPrescription?: ConsultationPrescription;
  onCreated: (prescription: ConsultationPrescription) => void;
}

const emptyItem: PrescriptionItemForm = {
  medicationId: '',
  medicationName: '',
  form: '',
  strength: '',
  availability: 'INTERNAL',
  externalReason: '',
  dosage: '',
  frequency: '',
  route: 'Orale',
  durationDays: '1',
  quantity: '1',
  instructions: '',
};

function itemLabel(item: ConsultationPrescription['items'][number]) {
  const name = item.medicationName || item.medication?.name || 'Médicament';
  const strength = item.strength || item.medication?.strength;
  return `${name}${strength ? ` ${strength}` : ''}`;
}

export function ConsultationStructuredPrescription({
  consultationId,
  patientId,
  diagnosis,
  existingPrescription,
  onCreated,
}: ConsultationStructuredPrescriptionProps) {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [items, setItems] = useState<PrescriptionItemForm[]>([{ ...emptyItem }]);
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [interactionOverrideReason, setInteractionOverrideReason] = useState('');
  const [loading, setLoading] = useState(!existingPrescription);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setItems([{ ...emptyItem }]);
    setGeneralInstructions('');
    setInteractionOverrideReason('');
  }, [consultationId]);

  useEffect(() => {
    if (existingPrescription) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void api<Medication[]>('/pharmacy/medications')
      .then((rows) => {
        if (!cancelled) setMedications(rows);
      })
      .catch((reason) => {
        if (!cancelled) {
          notifyError(
            reason instanceof Error ? reason.message : 'Chargement des médicaments impossible.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [existingPrescription]);

  const selectedKeys = useMemo(
    () =>
      items.map((item) =>
        item.medicationId
          ? `ID:${item.medicationId}`
          : `NAME:${item.medicationName.trim().toLocaleLowerCase('fr')}`,
      ),
    [items],
  );

  const updateItem = (index: number, field: keyof PrescriptionItemForm, value: string) => {
    setItems((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const selectMedication = (index: number, medicationId: string) => {
    const medication = medications.find((entry) => entry.id === medicationId);
    setItems((current) =>
      current.map((item, currentIndex) => {
        if (currentIndex !== index) return item;
        if (!medication) {
          return {
            ...item,
            medicationId: '',
            medicationName: '',
            form: '',
            strength: '',
            availability: 'NON_CATALOGUED',
          };
        }
        const internallyAvailable = medication.stockQuantity > 0;
        return {
          ...item,
          medicationId: medication.id,
          medicationName: medication.name,
          form: medication.form ?? '',
          strength: medication.strength ?? '',
          availability: internallyAvailable ? 'INTERNAL' : 'EXTERNAL',
          externalReason: internallyAvailable
            ? ''
            : 'Produit indisponible à la pharmacie de l’hôpital.',
        };
      }),
    );
  };

  const savePrescription = async () => {
    if (existingPrescription) return;
    const invalid = items.some(
      (item) =>
        (!item.medicationId && item.medicationName.trim().length < 2) ||
        !item.dosage.trim() ||
        !item.frequency.trim() ||
        !item.route.trim() ||
        Number(item.durationDays) < 1 ||
        Number(item.quantity) < 1,
    );
    if (invalid) {
      notifyWarning(
        'Complétez le médicament, le dosage, la fréquence, la voie, la durée et la quantité.',
      );
      return;
    }
    if (new Set(selectedKeys).size !== selectedKeys.length) {
      notifyWarning('Un même médicament ne peut apparaître qu’une fois dans l’ordonnance.');
      return;
    }

    setSubmitting(true);
    try {
      const prescription = await api<ConsultationPrescription>('/enterprise/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          consultationId,
          diagnosis: diagnosis?.trim() || undefined,
          generalInstructions: generalInstructions.trim() || undefined,
          interactionOverrideReason: interactionOverrideReason.trim() || undefined,
          items: items.map((item) => ({
            medicationId: item.medicationId || undefined,
            medicationName: item.medicationName.trim() || undefined,
            form: item.form.trim() || undefined,
            strength: item.strength.trim() || undefined,
            availability: item.medicationId ? item.availability : 'NON_CATALOGUED',
            externalReason: item.externalReason.trim() || undefined,
            dosage: item.dosage.trim(),
            frequency: item.frequency.trim(),
            route: item.route.trim(),
            durationDays: Number(item.durationDays),
            quantity: Number(item.quantity),
            instructions: item.instructions.trim() || undefined,
          })),
        }),
      });
      onCreated(prescription);
      notifySuccess(
        'L’ordonnance a été créée. Les produits externes sont enregistrés sans diminuer le stock hospitalier.',
        'Prescription enregistrée',
      );
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Prescription impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="clinical-structured-prescription">
      <div className="section-title prescription-section-title">
        <span>
          <Pill size={17} />
        </span>
        <div>
          <strong>Prescription médicamenteuse</strong>
          <small>Produits internes, indisponibles ou à acheter à l’extérieur.</small>
        </div>
      </div>

      {existingPrescription ? (
        <div className="prescription-created-summary">
          <div>
            <ReceiptText size={20} />
            <span>
              <strong>{existingPrescription.number}</strong>
              <small>
                {existingPrescription.paymentClearance?.inOrder ||
                existingPrescription.invoice?.status === 'PAID'
                  ? 'Paiement en ordre'
                  : 'Paiement à régulariser'}
              </small>
            </span>
          </div>
          <ul>
            {existingPrescription.items.map((item) => (
              <li key={item.id}>
                {itemLabel(item)} — {item.dosage}, {item.frequency}, {item.route},{' '}
                {item.durationDays} jour(s), quantité {item.quantity}
                {item.availability !== 'INTERNAL' && ' · achat extérieur'}
              </li>
            ))}
          </ul>
        </div>
      ) : loading ? (
        <div className="consultation-focus-loading">
          <Activity className="spin" size={18} /> Chargement du catalogue de médicaments…
        </div>
      ) : (
        <div className="structured-prescription-form">
          <div className="alert info">
            Un médicament absent du stock peut être prescrit manuellement. Il figurera sur
            l’ordonnance comme achat extérieur et ne modifiera aucun stock interne.
          </div>
          <div className="prescription-items-stack">
            {items.map((item, index) => {
              const selectedMedication = medications.find(
                (medication) => medication.id === item.medicationId,
              );
              const external =
                item.availability === 'EXTERNAL' || item.availability === 'NON_CATALOGUED';
              return (
                <article className="structured-prescription-item" key={index}>
                  <div className="prescription-item-heading">
                    <strong>Médicament {index + 1}</strong>
                    {items.length > 1 && (
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="Retirer ce médicament"
                        onClick={() =>
                          setItems((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label className="field full">
                      <span>Catalogue de la pharmacie</span>
                      <select
                        value={item.medicationId}
                        onChange={(event) => selectMedication(index, event.target.value)}
                      >
                        <option value="">Produit non référencé / achat extérieur</option>
                        {medications.map((medication) => (
                          <option value={medication.id} key={medication.id}>
                            {medication.name} {medication.strength ?? ''} — stock{' '}
                            {medication.stockQuantity}
                          </option>
                        ))}
                      </select>
                    </label>
                    {!item.medicationId && (
                      <>
                        <label className="field full">
                          <span>Nom du médicament externe*</span>
                          <input
                            required
                            value={item.medicationName}
                            onChange={(event) =>
                              updateItem(index, 'medicationName', event.target.value)
                            }
                            placeholder="Ex. médicament non disponible à l’hôpital"
                          />
                        </label>
                        <label className="field">
                          <span>Forme</span>
                          <input
                            value={item.form}
                            onChange={(event) => updateItem(index, 'form', event.target.value)}
                            placeholder="Comprimé, sirop, injection…"
                          />
                        </label>
                        <label className="field">
                          <span>Dosage commercial</span>
                          <input
                            value={item.strength}
                            onChange={(event) => updateItem(index, 'strength', event.target.value)}
                            placeholder="Ex. 500 mg"
                          />
                        </label>
                      </>
                    )}
                    <label className="field">
                      <span>Disponibilité*</span>
                      <select
                        value={item.availability}
                        onChange={(event) => updateItem(index, 'availability', event.target.value)}
                      >
                        {item.medicationId && (
                          <option value="INTERNAL">Disponible à l’hôpital</option>
                        )}
                        {item.medicationId && (
                          <option value="PARTIAL">Partiellement disponible</option>
                        )}
                        <option value="EXTERNAL">Achat extérieur</option>
                        {!item.medicationId && (
                          <option value="NON_CATALOGUED">Non référencé</option>
                        )}
                      </select>
                      {selectedMedication && (
                        <small>Stock disponible : {selectedMedication.stockQuantity}</small>
                      )}
                    </label>
                    {external && (
                      <label className="field">
                        <span>Motif de l’achat extérieur</span>
                        <input
                          value={item.externalReason}
                          onChange={(event) =>
                            updateItem(index, 'externalReason', event.target.value)
                          }
                          placeholder="Rupture, produit non référencé…"
                        />
                      </label>
                    )}
                    <label className="field">
                      <span>Dosage prescrit*</span>
                      <input
                        required
                        placeholder="Ex. 1 comprimé"
                        value={item.dosage}
                        onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Fréquence*</span>
                      <input
                        required
                        placeholder="Ex. 2 fois par jour"
                        value={item.frequency}
                        onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Voie*</span>
                      <input
                        required
                        value={item.route}
                        onChange={(event) => updateItem(index, 'route', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Durée (jours)*</span>
                      <input
                        required
                        type="number"
                        min="1"
                        max="365"
                        value={item.durationDays}
                        onChange={(event) => updateItem(index, 'durationDays', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Quantité*</span>
                      <input
                        required
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                      />
                    </label>
                    <label className="field full">
                      <span>Instructions particulières</span>
                      <input
                        placeholder="Ex. après le repas"
                        value={item.instructions}
                        onChange={(event) => updateItem(index, 'instructions', event.target.value)}
                      />
                    </label>
                  </div>
                </article>
              );
            })}
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setItems((current) => [...current, { ...emptyItem }])}
          >
            <Plus size={15} /> Ajouter un médicament
          </button>
          <div className="form-grid prescription-instructions-grid">
            <label className="field full">
              <span>Instructions générales</span>
              <textarea
                rows={2}
                value={generalInstructions}
                onChange={(event) => setGeneralInstructions(event.target.value)}
              />
            </label>
            <label className="field full">
              <span>Motif médical si une interaction doit être exceptionnellement acceptée</span>
              <textarea
                rows={2}
                minLength={10}
                value={interactionOverrideReason}
                onChange={(event) => setInteractionOverrideReason(event.target.value)}
              />
            </label>
          </div>
          <div className="prescription-payment-notice">
            Seuls les produits réellement disponibles à la pharmacie hospitalière suivent le circuit
            interne de caisse et sont délivrés. Les produits externes restent visibles sur
            l’ordonnance imprimée.
          </div>
          <div className="modal-actions embedded-actions">
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void savePrescription()}
            >
              {submitting && <Activity className="spin" size={16} />}
              <ReceiptText size={16} /> Créer l’ordonnance
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
