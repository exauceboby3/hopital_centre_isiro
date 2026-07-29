'use client';

import { Activity, Search, ShieldAlert, ShieldX, Siren } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { Patient } from '@/lib/types';

type EmergencyPatient = Patient;

interface BreakGlassGrant {
  id: string;
  patientId: string;
  startedAt: string;
  expiresAt: string;
  reason: string;
}

const localInput = (date: Date) => {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};

export default function EmergencyAccessPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<EmergencyPatient[]>([]);
  const [selected, setSelected] = useState<EmergencyPatient | null>(null);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState(localInput(new Date(Date.now() + 15 * 60_000)));
  const [active, setActive] = useState<BreakGlassGrant | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      setResults(
        await api<EmergencyPatient[]>(
          `/clinical-governance/emergency-patient-lookup?search=${encodeURIComponent(query.trim())}`,
        ),
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Recherche d’urgence impossible.');
    } finally {
      setLoading(false);
    }
  };

  const grant = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await api<BreakGlassGrant>(
        `/clinical-governance/patients/${selected.id}/break-glass`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: reason.trim(),
            expiresAt: new Date(expiresAt).toISOString(),
          }),
        },
      );
      setActive(result);
      notifySuccess(
        'Le dossier est accessible temporairement. Les administrateurs ont été notifiés et chaque consultation du dossier sera auditée.',
        'Bris de glace ouvert',
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Ouverture d’urgence impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async () => {
    if (!active) return;
    setSubmitting(true);
    try {
      await api(`/clinical-governance/break-glass/${active.id}/revoke`, { method: 'PATCH' });
      setActive(null);
      setSelected(null);
      setReason('');
      notifySuccess('L’accès exceptionnel est fermé avant son échéance.');
    } catch (error) {
      notifyError(error instanceof Error ? error.message : 'Révocation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const remainingSeconds = useMemo(
    () => (active ? Math.max(Math.floor((new Date(active.expiresAt).getTime() - now) / 1000), 0) : 0),
    [active, now],
  );
  const maximumExpiry = localInput(new Date(Date.now() + 30 * 60_000));

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Urgence vitale et traçabilité renforcée</span>
          <h1>Accès « bris de glace »</h1>
          <p>
            Ouvrez un dossier non affecté pendant 30 minutes maximum. Cette autorisation ne supprime aucune dette et ne remplace pas une mesure de grâce financière.
          </p>
        </div>
        <Siren size={32} />
      </div>

      <div className="alert warning">
        <ShieldAlert size={20} />
        Utilisez cet accès uniquement lorsqu’un retard pourrait compromettre la sécurité ou la vie du patient. Le motif, l’utilisateur, l’heure et l’expiration sont inscrits dans l’audit.
      </div>

      <section className="panel emergency-lookup-panel">
        <form className="emergency-search-form" onSubmit={search}>
          <label className="field full">
            <span>Identifier le patient par nom, numéro de dossier ou téléphone</span>
            <div className="emergency-search-line">
              <input
                required
                minLength={2}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ex. CHI-2026-000014 ou nom du patient"
              />
              <button className="primary-button" disabled={loading || query.trim().length < 2}>
                {loading ? <Activity className="spin" size={17} /> : <Search size={17} />} Rechercher
              </button>
            </div>
          </label>
        </form>

        <div className="emergency-result-list">
          {results.map((patient) => (
            <button
              className={selected?.id === patient.id ? 'emergency-patient-card selected' : 'emergency-patient-card'}
              key={patient.id}
              onClick={() => setSelected(patient)}
              type="button"
            >
              <strong>{patientName(patient)}</strong>
              <span>{patient.medicalRecordNumber}</span>
              <small>
                {patient.sex === 'FEMALE' ? 'Femme' : 'Homme'}
                {patient.dateOfBirth
                  ? ` · né(e) le ${new Intl.DateTimeFormat('fr-FR').format(new Date(patient.dateOfBirth))}`
                  : ''}
              </small>
            </button>
          ))}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <div className="empty-state">Aucun patient correspondant.</div>
          )}
        </div>
      </section>

      {selected && !active && (
        <section className="panel break-glass-form-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Patient sélectionné</span>
              <h2>{patientName(selected)}</h2>
              <span>{selected.medicalRecordNumber}</span>
            </div>
            <ShieldAlert size={24} />
          </div>
          <form onSubmit={grant}>
            <div className="form-grid">
              <label className="field full">
                <span>Motif clinique détaillé *</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Décrire l’urgence, le risque immédiat et pourquoi l’accès normal ne peut pas être attendu…"
                />
              </label>
              <label className="field full">
                <span>Expiration automatique *</span>
                <input
                  required
                  type="datetime-local"
                  min={localInput(new Date(Date.now() + 60_000))}
                  max={maximumExpiry}
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button className="danger-button" disabled={submitting || reason.trim().length < 10}>
                <ShieldAlert size={17} /> Ouvrir temporairement le dossier
              </button>
            </div>
          </form>
        </section>
      )}

      {active && selected && (
        <section className="panel active-break-glass-panel">
          <ShieldAlert size={30} />
          <div>
            <span className="eyebrow">Accès d’urgence actif</span>
            <strong>{patientName(selected)} — {selected.medicalRecordNumber}</strong>
            <p>{active.reason}</p>
            <span>
              Temps restant : {Math.floor(remainingSeconds / 60)} min {remainingSeconds % 60} s
            </span>
          </div>
          <div className="row-actions">
            <a className="primary-button" href={`/patients?patientId=${selected.id}`}>
              Consulter le dossier
            </a>
            <button className="secondary-button" disabled={submitting} onClick={() => void revoke()}>
              <ShieldX size={17} /> Fermer l’accès
            </button>
          </div>
        </section>
      )}
    </>
  );
}
