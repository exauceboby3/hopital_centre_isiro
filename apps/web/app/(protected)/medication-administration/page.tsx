'use client';

import { Activity, FileCheck2, Printer, ScanLine, Syringe } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';

interface AdministrationEvent {
  id: string;
  nursingCareId: string;
  patientId: string;
  nurseId: string;
  status: string;
  scheduledAt: string;
  performedAt: string;
  prescribedDose?: string | null;
  administeredDose?: string | null;
  route?: string | null;
  omissionReason?: string | null;
  comment?: string | null;
  adverseReaction?: string | null;
  patientBarcode?: string | null;
  medicationBarcode?: string | null;
  signatureHash: string;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
  medicationName?: string | null;
  careLabel: string;
  nurseUsername: string;
}

const dateTime = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );

const patientName = (row: AdministrationEvent) =>
  [row.lastName, row.postName, row.firstName].filter(Boolean).join(' ');

export default function MedicationAdministrationPage() {
  const [rows, setRows] = useState<AdministrationEvent[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<AdministrationEvent[]>('/nursing-care/administration-ledger'));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Feuille d’administration indisponible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (!status || row.status === status) &&
        (!needle ||
          `${patientName(row)} ${row.medicalRecordNumber} ${row.medicationName ?? ''} ${row.careLabel} ${row.nurseUsername}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [rows, query, status]);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Traçabilité médicamenteuse signée</span>
          <h1>Feuille d’administration des médicaments</h1>
          <p>
            Chaque dose administrée, refusée, omise ou manquée conserve l’horaire prévu, l’heure réelle, le professionnel, le motif et l’empreinte numérique.
          </p>
        </div>
        <button className="secondary-button" onClick={() => window.print()}>
          <Printer size={17} /> Imprimer la feuille
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel table-panel medication-ledger-panel">
        <div className="panel-toolbar">
          <div>
            <strong>Registre sécurisé</strong>
            <span>{filtered.length} administration(s)</span>
          </div>
          <div className="medication-ledger-filters">
            <input
              className="table-search"
              placeholder="Patient, dossier, médicament ou infirmier…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tous les résultats</option>
              <option value="ADMINISTERED">Administré</option>
              <option value="REFUSED">Refusé</option>
              <option value="OMITTED">Omis</option>
              <option value="MISSED">Manqué</option>
            </select>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Prévu / réalisé</th>
                <th>Patient</th>
                <th>Médicament / soin</th>
                <th>Dose / voie</th>
                <th>Résultat</th>
                <th>Infirmier</th>
                <th>Contrôles</th>
                <th>Signature</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="empty-state"><Activity className="spin" /> Chargement…</div></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><Syringe /><strong>Aucune administration enregistrée</strong></div></td></tr>
              ) : filtered.map((row) => (
                <tr key={row.id}>
                  <td><strong>{dateTime(row.scheduledAt)}</strong><br /><span className="muted">Réel : {dateTime(row.performedAt)}</span></td>
                  <td><strong>{patientName(row)}</strong><br /><span className="muted">{row.medicalRecordNumber}</span></td>
                  <td><strong>{row.medicationName || row.careLabel}</strong><br /><span className="muted">{row.careLabel}</span></td>
                  <td>{row.administeredDose || row.prescribedDose || '—'}<br /><span className="muted">{row.route || 'Voie non précisée'}</span></td>
                  <td><StatusBadge status={row.status} />{row.omissionReason && <><br /><span className="muted">{row.omissionReason}</span></>}</td>
                  <td>{row.nurseUsername}{row.comment && <><br /><span className="muted">{row.comment}</span></>}</td>
                  <td>
                    <span className="medication-scan-state"><ScanLine size={14} /> Patient : {row.patientBarcode ? 'scanné' : 'non scanné'}</span><br />
                    <span className="medication-scan-state"><ScanLine size={14} /> Médicament : {row.medicationBarcode ? 'scanné' : 'non scanné'}</span>
                    {row.adverseReaction && <><br /><strong>Réaction : {row.adverseReaction}</strong></>}
                  </td>
                  <td title={row.signatureHash}><span className="medication-signature"><FileCheck2 size={16} /> {row.signatureHash.slice(0, 12)}…</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
