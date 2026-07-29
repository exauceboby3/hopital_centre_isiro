'use client';

import { Activity, Pill, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { currency } from '@/lib/display';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import { useAuth } from './auth-provider';

interface Consultation {
  id: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  patient: Patient;
  doctor: { lastName: string; postName?: string; firstName?: string };
  clinicalReport?: { diagnosis?: string };
}

interface Medication {
  id: string;
  name: string;
  form?: string;
  strength?: string;
  stockQuantity: number;
  unitPrice: string;
}

interface Prescription {
  id: string;
  number: string;
  consultationId?: string;
  status: string;
  invoice: { id: string; number: string; status: string };
  items: Array<{
    id: string;
    dosage: string;
    frequency: string;
    route: string;
    durationDays: number;
    quantity: number;
    medication: Medication;
  }>;
}

interface PrescriptionItemForm {
  medicationId: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: string;
  quantity: string;
  instructions: string;
}

const emptyItem: PrescriptionItemForm = {
  medicationId: '',
  dosage: '',
  frequency: '',
  route: 'Orale',
  durationDays: '1',
  quantity: '1',
  instructions: '',
};

const recordPattern = /CHI-\d{4}-\d+/i;

function normalized(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr');
}

function dateLabel(consultation: Consultation) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(consultation.startedAt ?? consultation.createdAt),
  );
}

export function ConsultationStructuredPrescription() {
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed =
    pathname === '/consultations' && hasAnyRole(user, ['DOCTOR', 'SURGEON', 'MIDWIFE']);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [activeConsultation, setActiveConsultation] = useState<Consultation | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [items, setItems] = useState<PrescriptionItemForm[]>([{ ...emptyItem }]);
  const [generalInstructions, setGeneralInstructions] = useState('');
  const [interactionOverrideReason, setInteractionOverrideReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const [consultationRows, medicationRows, prescriptionRows] = await Promise.all([
        api<Consultation[]>('/consultations'),
        api<Medication[]>('/pharmacy/medications'),
        api<Prescription[]>('/enterprise/prescriptions'),
      ]);
      setConsultations(consultationRows);
      setMedications(medicationRows.filter((medication) => medication.stockQuantity >= 0));
      setPrescriptions(prescriptionRows);
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Chargement de la prescription impossible.');
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;

    const onOpen = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
      if (!button || !button.textContent?.includes('Ouvrir la fiche')) return;
      const row = button.closest<HTMLTableRowElement>('tr');
      const recordNumber = row?.textContent?.match(recordPattern)?.[0];
      if (!row || !recordNumber) return;
      const rowText = normalized(row.textContent ?? '');
      const candidates = consultations
        .filter(
          (consultation) =>
            consultation.patient.medicalRecordNumber.toUpperCase() === recordNumber.toUpperCase(),
        )
        .sort(
          (a, b) =>
            new Date(b.startedAt ?? b.createdAt).getTime() -
            new Date(a.startedAt ?? a.createdAt).getTime(),
        );
      const selected =
        candidates.find((consultation) => rowText.includes(normalized(dateLabel(consultation)))) ??
        candidates[0];
      setActiveConsultation(selected ?? null);
      setItems([{ ...emptyItem }]);
      setGeneralInstructions('');
      setInteractionOverrideReason('');
    };

    document.addEventListener('click', onOpen, true);
    return () => document.removeEventListener('click', onOpen, true);
  }, [allowed, consultations]);

  useEffect(() => {
    if (!allowed || !activeConsultation) {
      setTarget(null);
      return;
    }

    const mount = () => {
      const modal = [...document.querySelectorAll<HTMLElement>('.modal-card')].find(
        (entry) =>
          entry.textContent?.includes(activeConsultation.patient.medicalRecordNumber) &&
          entry.textContent?.includes('Décision de fin de consultation'),
      );
      if (!modal) return false;
      const legacyLabel = [...modal.querySelectorAll<HTMLLabelElement>('label')].find((label) =>
        label.textContent?.includes('Prescription structurée / instructions'),
      );
      if (!legacyLabel?.parentElement) return false;
      legacyLabel.hidden = true;
      const existing = modal.querySelector<HTMLElement>('.consultation-prescription-slot');
      if (existing) {
        setTarget(existing);
        return true;
      }
      const slot = document.createElement('div');
      slot.className = 'consultation-prescription-slot full';
      legacyLabel.insertAdjacentElement('afterend', slot);
      setTarget(slot);
      return true;
    };

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (mount() || attempts >= 30) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [activeConsultation, allowed]);

  const existingPrescription = useMemo(
    () => prescriptions.find((prescription) => prescription.consultationId === activeConsultation?.id),
    [activeConsultation?.id, prescriptions],
  );

  useEffect(() => {
    if (!target || !activeConsultation) return;
    const form = target.closest('.modal-card')?.querySelector<HTMLFormElement>('form');
    if (!form) return;
    const preventIncompletePrescription = (event: Event) => {
      const decision = [...form.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
        [...select.options].some((option) => option.value === 'PRESCRIPTION'),
      );
      if (decision?.value !== 'PRESCRIPTION' || existingPrescription) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      notifyWarning(
        'Créez d’abord l’ordonnance structurée et sa facture avant de terminer la consultation avec une prescription.',
        'Prescription requise',
      );
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    form.addEventListener('submit', preventIncompletePrescription, true);
    return () => form.removeEventListener('submit', preventIncompletePrescription, true);
  }, [activeConsultation, existingPrescription, target]);

  const updateItem = (index: number, field: keyof PrescriptionItemForm, value: string) => {
    setItems((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const savePrescription = async () => {
    if (!activeConsultation || existingPrescription) return;
    if (items.some((item) => !item.medicationId || !item.dosage.trim() || !item.frequency.trim())) {
      notifyWarning('Complétez le médicament, le dosage et la fréquence de chaque ligne.');
      return;
    }

    setSubmitting(true);
    try {
      await api('/enterprise/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId: activeConsultation.patient.id,
          consultationId: activeConsultation.id,
          diagnosis: activeConsultation.clinicalReport?.diagnosis || undefined,
          generalInstructions: generalInstructions || undefined,
          interactionOverrideReason: interactionOverrideReason || undefined,
          items: items.map((item) => ({
            medicationId: item.medicationId,
            dosage: item.dosage.trim(),
            frequency: item.frequency.trim(),
            route: item.route.trim(),
            durationDays: Number(item.durationDays),
            quantity: Number(item.quantity),
            instructions: item.instructions.trim() || undefined,
          })),
        }),
      });
      notifySuccess(
        'L’ordonnance structurée et la facture des médicaments ont été créées. Le patient paiera avant la délivrance à la pharmacie.',
        'Prescription enregistrée',
      );
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Prescription impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!allowed || !target || !activeConsultation) return null;

  return createPortal(
    <section className="clinical-structured-prescription">
      <div className="section-title prescription-section-title">
        <span><Pill size={17} /></span>
        <div>
          <strong>Prescription médicamenteuse structurée</strong>
          <small>Même circuit que Gestion intégrée : ordonnance, facture, paiement puis délivrance.</small>
        </div>
      </div>

      {existingPrescription ? (
        <div className="prescription-created-summary">
          <div>
            <ReceiptText size={20} />
            <span>
              <strong>{existingPrescription.number}</strong>
              <small>
                Facture {existingPrescription.invoice.number} · {existingPrescription.invoice.status}
              </small>
            </span>
          </div>
          <ul>
            {existingPrescription.items.map((item) => (
              <li key={item.id}>
                {item.medication.name} — {item.dosage}, {item.frequency}, {item.route},{' '}
                {item.durationDays} jour(s), quantité {item.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="structured-prescription-form">
          <div className="prescription-items-stack">
            {items.map((item, index) => {
              const selectedMedication = medications.find(
                (medication) => medication.id === item.medicationId,
              );
              return (
                <article className="structured-prescription-item" key={index}>
                  <div className="prescription-item-heading">
                    <strong>Médicament {index + 1}</strong>
                    {items.length > 1 && (
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="Retirer ce médicament"
                        onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label className="field full">
                      <span>Médicament *</span>
                      <select
                        value={item.medicationId}
                        onChange={(event) => updateItem(index, 'medicationId', event.target.value)}
                      >
                        <option value="">Sélectionner dans le catalogue</option>
                        {medications.map((medication) => (
                          <option value={medication.id} key={medication.id}>
                            {medication.name} {medication.strength ?? ''} — stock {medication.stockQuantity} —{' '}
                            {currency(medication.unitPrice)}
                          </option>
                        ))}
                      </select>
                      {selectedMedication && selectedMedication.stockQuantity <= 0 && (
                        <small className="danger-text">Rupture de stock : achat extérieur à prévoir.</small>
                      )}
                    </label>
                    <label className="field">
                      <span>Dosage *</span>
                      <input
                        placeholder="Ex. 500 mg"
                        value={item.dosage}
                        onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Fréquence *</span>
                      <input
                        placeholder="Ex. 2 fois par jour"
                        value={item.frequency}
                        onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Voie *</span>
                      <input
                        value={item.route}
                        onChange={(event) => updateItem(index, 'route', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Durée (jours) *</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={item.durationDays}
                        onChange={(event) => updateItem(index, 'durationDays', event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Quantité *</span>
                      <input
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
            La prescription crée une facture séparée. Les médicaments sont délivrés uniquement après
            paiement ou garantie valide.
          </div>
          <div className="modal-actions embedded-actions">
            <button
              className="primary-button"
              type="button"
              disabled={submitting}
              onClick={() => void savePrescription()}
            >
              {submitting && <Activity className="spin" size={16} />}
              <ReceiptText size={16} /> Créer l’ordonnance et la facture
            </button>
          </div>
        </div>
      )}
    </section>,
    target,
  );
}
