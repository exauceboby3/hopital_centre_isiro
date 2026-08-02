'use client';

import { Activity, AlertTriangle, ArrowLeft, FileClock, FilePlus2, HeartPulse, ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { api } from '@/lib/api';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';
import './patient-record.css';

type HistoryEntry = {
  id: string;
  kind: string;
  date: string;
  dateKey: string;
  title: string;
  description?: string;
  status?: string;
  author?: string;
  department?: string;
};

type History = {
  patient: Patient;
  entries: HistoryEntry[];
  groups: Array<{ date: string; entries: HistoryEntry[] }>;
  counts: Record<string, number>;
};

type Amendment = {
  id: string;
  category: string;
  fieldName: string;
  previousValue?: string | null;
  newValue: string;
  reason: string;
  createdAt: string;
  author: { username: string; role: string };
  consultation?: { id: string; reason: string; status: string } | null;
};

type PatientDetails = Patient & {
  appointments?: unknown[];
  consultations?: Array<{ id: string; reason: string; status: string; createdAt: string }>;
  examRequests?: unknown[];
  hospitalizations?: unknown[];
  clinicalAmendments?: Amendment[];
};

const labels: Record<string, string> = {
  APPOINTMENT: 'Rendez-vous',
  CONSULTATION: 'Consultation',
  LABORATORY: 'Laboratoire',
  HOSPITALIZATION: 'Hospitalisation',
  VITAL_SIGN: 'Signes vitaux',
  PRESCRIPTION: 'Ordonnance',
  INVOICE: 'Facturation',
  PAYMENT: 'Paiement',
  NURSING: 'Nursing',
  RADIOLOGY: 'Imagerie',
  AMENDMENT: 'Avenant médical',
};

const fullName = (patient: Patient) => [patient.lastName, patient.postName, patient.firstName].filter(Boolean).join(' ');

function ageOf(date?: string) {
  if (!date) return 'Âge inconnu';
  const birth = new Date(date);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const month = now.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < birth.getDate())) years -= 1;
  return `${Math.max(0, years)} ans`;
}

export default function PatientRecordPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const patientId = params.id;
  const canAmend = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);
  const [patient, setPatient] = useState<PatientDetails | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [tab, setTab] = useState<'SUMMARY' | 'TIMELINE' | 'AMENDMENTS'>('SUMMARY');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    category: 'CONSULTATION',
    fieldName: 'Observation clinique',
    previousValue: '',
    newValue: '',
    reason: '',
    consultationId: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [details, timeline, amendmentRows] = await Promise.all([
        api<PatientDetails>(`/patients/${patientId}`),
        api<History>(`/patients/${patientId}/history`),
        api<Amendment[]>(`/patients/${patientId}/amendments`),
      ]);
      setPatient(details);
      setHistory(timeline);
      setAmendments(amendmentRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Dossier patient inaccessible.');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => void load(), [load]);

  const createAmendment = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/patients/${patientId}/amendments`, {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          consultationId: form.consultationId || undefined,
          previousValue: form.previousValue || undefined,
        }),
      });
      setForm((current) => ({ ...current, previousValue: '', newValue: '', reason: '' }));
      setNotice('Avenant médical enregistré sans modifier ni supprimer la donnée originale.');
      await load();
      setTab('AMENDMENTS');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Avenant impossible.');
    } finally {
      setSaving(false);
    }
  };

  const latest = useMemo(() => history?.entries.slice(0, 6) ?? [], [history]);

  if (loading) return <section className="panel empty-state"><Activity className="spin" /> Ouverture du dossier médical…</section>;
  if (!patient || !history) return <section className="panel alert error">{error || 'Dossier introuvable.'}</section>;

  return (
    <div className="patient-record-shell">
      <header className="patient-record-header">
        <Link className="icon-button" href="/patients" aria-label="Retour"><ArrowLeft /></Link>
        <div className="patient-record-avatar"><UserRound /></div>
        <div className="patient-record-identity">
          <span className="eyebrow">Dossier médical longitudinal</span>
          <h1>{fullName(patient)}</h1>
          <p>{patient.medicalRecordNumber} · {ageOf(patient.dateOfBirth)} · {patient.sex === 'MALE' ? 'Masculin' : 'Féminin'}</p>
        </div>
        <div className="patient-record-alerts">
          <span><HeartPulse size={16} /> Groupe {patient.bloodType || 'inconnu'}</span>
          <span><ShieldCheck size={16} /> Accès journalisé</span>
        </div>
      </header>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <nav className="patient-record-tabs">
        <button className={tab === 'SUMMARY' ? 'active' : ''} onClick={() => setTab('SUMMARY')}>Vue générale</button>
        <button className={tab === 'TIMELINE' ? 'active' : ''} onClick={() => setTab('TIMELINE')}>Chronologie</button>
        <button className={tab === 'AMENDMENTS' ? 'active' : ''} onClick={() => setTab('AMENDMENTS')}>Corrections et ajouts</button>
      </nav>

      {tab === 'SUMMARY' && (
        <div className="patient-record-grid">
          <section className="panel patient-summary-card">
            <div className="panel-heading"><div><span className="eyebrow">Identité</span><h2>Informations essentielles</h2></div><UserRound /></div>
            <dl><div><dt>Téléphone</dt><dd>{patient.phone || 'Non renseigné'}</dd></div><div><dt>Adresse</dt><dd>{patient.address || 'Non renseignée'}</dd></div><div><dt>Contact d’urgence</dt><dd>{patient.emergencyContact || 'Non renseigné'}</dd></div><div><dt>Date de naissance</dt><dd>{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString('fr-CD') : 'Non renseignée'}</dd></div></dl>
          </section>
          <section className="panel">
            <div className="panel-heading"><div><span className="eyebrow">Résumé clinique</span><h2>Activité du dossier</h2></div><Stethoscope /></div>
            <div className="patient-count-grid">{Object.entries(history.counts).slice(0, 8).map(([kind, count]) => <article key={kind}><span>{labels[kind] ?? kind}</span><strong>{count}</strong></article>)}</div>
          </section>
          <section className="panel patient-latest-events">
            <div className="panel-heading"><div><span className="eyebrow">Dernières actions</span><h2>Événements récents</h2></div><FileClock /></div>
            {latest.map((entry) => <article key={`${entry.kind}-${entry.id}`}><div><strong>{entry.title}</strong><span>{entry.description || 'Aucun détail'}</span></div><time>{new Date(entry.date).toLocaleString('fr-CD')}</time></article>)}
          </section>
          <section className="panel patient-safety-card">
            <div className="panel-heading"><div><span className="eyebrow">Sécurité médicale</span><h2>Règles d’utilisation</h2></div><AlertTriangle /></div>
            <p>La donnée originale d’une consultation signée reste immuable. Toute correction médicale est enregistrée comme avenant avec le médecin, la date, l’ancienne valeur, la nouvelle valeur et le motif.</p>
          </section>
        </div>
      )}

      {tab === 'TIMELINE' && (
        <section className="panel patient-timeline-panel">
          {history.groups.map((group) => <div className="patient-timeline-group" key={group.date}><h3>{new Date(`${group.date}T00:00:00`).toLocaleDateString('fr-CD', { dateStyle: 'full' })}</h3>{group.entries.map((entry) => <article key={`${entry.kind}-${entry.id}`}><i /><div><span className="eyebrow">{labels[entry.kind] ?? entry.kind}</span><strong>{entry.title}</strong><p>{entry.description || 'Aucun détail complémentaire.'}</p><small>{entry.author || 'Système'} · {entry.department || 'Service non précisé'} · {new Date(entry.date).toLocaleTimeString('fr-CD', { hour: '2-digit', minute: '2-digit' })}</small></div></article>)}</div>)}
        </section>
      )}

      {tab === 'AMENDMENTS' && (
        <div className="patient-amendment-layout">
          {canAmend && <form className="panel" onSubmit={createAmendment}><div className="panel-heading"><div><span className="eyebrow">Traçabilité obligatoire</span><h2>Ajouter ou corriger une donnée</h2></div><FilePlus2 /></div><div className="form-grid"><label className="field"><span>Catégorie</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>CONSULTATION</option><option>DIAGNOSTIC</option><option>TRAITEMENT</option><option>ANTECEDENT</option><option>ALLERGIE</option><option>OBSERVATION</option></select></label><label className="field"><span>Champ concerné</span><input required value={form.fieldName} onChange={(event) => setForm({ ...form, fieldName: event.target.value })} /></label><label className="field full"><span>Consultation liée</span><select value={form.consultationId} onChange={(event) => setForm({ ...form, consultationId: event.target.value })}><option value="">Aucune consultation spécifique</option>{patient.consultations?.map((consultation) => <option key={consultation.id} value={consultation.id}>{new Date(consultation.createdAt).toLocaleDateString('fr-CD')} · {consultation.reason} · {consultation.status}</option>)}</select></label><label className="field full"><span>Ancienne valeur</span><textarea rows={2} value={form.previousValue} onChange={(event) => setForm({ ...form, previousValue: event.target.value })} /></label><label className="field full"><span>Nouvelle valeur *</span><textarea required rows={3} value={form.newValue} onChange={(event) => setForm({ ...form, newValue: event.target.value })} /></label><label className="field full"><span>Argument / motif médical *</span><textarea required minLength={10} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label></div><div className="modal-actions"><button className="primary-button" disabled={saving}>Enregistrer l’avenant</button></div></form>}
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">Historique immuable</span><h2>Avenants médicaux</h2></div><strong>{amendments.length}</strong></div><div className="patient-amendment-list">{amendments.length === 0 ? <p className="muted">Aucune correction médicale enregistrée.</p> : amendments.map((row) => <article key={row.id}><header><strong>{row.fieldName}</strong><span>{row.category}</span></header>{row.previousValue && <p><b>Ancienne valeur :</b> {row.previousValue}</p>}<p><b>Nouvelle valeur :</b> {row.newValue}</p><p><b>Motif :</b> {row.reason}</p><small>{row.author.username} · {new Date(row.createdAt).toLocaleString('fr-CD')}</small></article>)}</div></section>
        </div>
      )}
    </div>
  );
}
