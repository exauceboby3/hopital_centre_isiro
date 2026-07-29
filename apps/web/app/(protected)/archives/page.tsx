'use client';

import {
  Activity,
  Archive,
  ArchiveRestore,
  Download,
  Eye,
  FileClock,
  Settings2,
  Trash2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api, apiUrl } from '@/lib/api';
import { patientName } from '@/lib/display';
import { hasRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface ArchivedPatient extends Patient {
  archivedAt: string;
  archiveDepartment?: string;
  archiveReason?: string;
  retentionUntil?: string;
  archiveReference?: string;
  archivedBy?: { id: string; username: string };
  _count: Record<string, number>;
}

interface ArchiveList {
  items: ArchivedPatient[];
  filters: { departments: Array<{ value: string; count: number }> };
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface ArchivePolicy {
  retentionYears: number;
  autoArchiveAfterMonths?: number;
  requireReason: boolean;
  updatedAt: string;
  updatedBy?: { username: string };
}

interface ArchiveDetail {
  patient: ArchivedPatient;
  counts: Record<string, number>;
  customFields: Array<{ definition: { label: string }; value: unknown }>;
  events: Array<{
    id: string;
    reference: string;
    action: 'ARCHIVED' | 'RESTORED';
    reason: string;
    department?: string;
    occurredAt: string;
    actor?: { username: string };
  }>;
  timeline: Array<{
    id: string;
    date: string;
    department: string;
    title: string;
    status?: string;
    description?: string;
  }>;
}

const departmentLabels: Record<string, string> = {
  GENERAL: 'Archives générales',
  RECEPTION: 'Réception',
  CLINICAL: 'Clinique',
  LABORATORY: 'Laboratoire',
  HOSPITALIZATION: 'Hospitalisation',
  PHARMACY: 'Pharmacie',
  RADIOLOGY: 'Radiologie',
  MATERNITY: 'Maternité',
  SURGERY: 'Chirurgie',
  PEDIATRICS: 'Pédiatrie',
  FINANCE: 'Finance',
  NURSING: 'Soins infirmiers',
  SPECIALTY: 'Dossier spécialisé',
};

const countLabels: Record<string, string> = {
  appointments: 'Rendez-vous',
  consultations: 'Consultations',
  vitalSigns: 'Constantes',
  examinations: 'Examens',
  hospitalizations: 'Hospitalisations',
  invoices: 'Factures',
  clinicalOrders: 'Actes cliniques',
  insurancePolicies: 'Assurances',
  transfusions: 'Transfusions',
  prescriptions: 'Ordonnances',
  specialtyCases: 'Dossiers spécialisés',
  radiologyStudies: 'Imageries',
  careVouchers: 'Bons de soins',
  nursingCare: 'Soins infirmiers',
};

export default function ArchivesPage() {
  const { user } = useAuth();
  const canManage = hasRole(user, 'SUPER_ADMIN');
  const [rows, setRows] = useState<ArchivedPatient[]>([]);
  const [total, setTotal] = useState(0);
  const [departments, setDepartments] = useState<Array<{ value: string; count: number }>>([]);
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<ArchiveDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [restoring, setRestoring] = useState<ArchivedPatient | null>(null);
  const [restoreReason, setRestoreReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policy, setPolicy] = useState<ArchivePolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    retentionYears: '10',
    autoArchiveAfterMonths: '',
    requireReason: true,
  });

  const load = useCallback(async (term = '', selectedDepartment = '', selectedYear = '') => {
    setLoading(true);
    setError('');
    try {
      const parameters = new URLSearchParams({ limit: '100' });
      if (term.trim()) parameters.set('search', term.trim());
      if (selectedDepartment) parameters.set('department', selectedDepartment);
      if (selectedYear) parameters.set('year', selectedYear);
      const result = await api<ArchiveList>(`/archives/patients?${parameters}`);
      setRows(result.items);
      setTotal(result.pagination.total);
      setDepartments(result.filters.departments);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement des archives impossible.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(query, department, year), 250);
    return () => window.clearTimeout(timeout);
  }, [query, department, year, load]);

  useEffect(() => {
    void api<ArchivePolicy>('/archives/policy')
      .then((value) => {
        setPolicy(value);
        setPolicyForm({
          retentionYears: String(value.retentionYears),
          autoArchiveAfterMonths: value.autoArchiveAfterMonths
            ? String(value.autoArchiveAfterMonths)
            : '',
          requireReason: value.requireReason,
        });
      })
      .catch(() => undefined);
  }, []);

  const openDetail = async (patient: ArchivedPatient) => {
    setDetailLoading(true);
    setError('');
    try {
      setDetail(await api<ArchiveDetail>(`/archives/patients/${patient.id}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Archive indisponible.');
    } finally {
      setDetailLoading(false);
    }
  };

  const restore = async (event: FormEvent) => {
    event.preventDefault();
    if (!restoring) return;
    setSubmitting(true);
    setError('');
    try {
      await api(`/archives/patients/${restoring.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ reason: restoreReason }),
      });
      setNotice(
        `Le dossier ${restoring.medicalRecordNumber} a été restauré dans les patients actifs.`,
      );
      setRestoring(null);
      setDetail(null);
      setRestoreReason('');
      await load(query, department, year);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Restauration impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const removePermanently = async (patient: ArchivedPatient) => {
    const confirmation = window.prompt(
      `Cette opération supprimera définitivement l’archive et toutes les données liées.\n\nSaisissez exactement ${patient.medicalRecordNumber} pour confirmer.`,
    );
    if (confirmation?.trim() !== patient.medicalRecordNumber) return;
    setSubmitting(true);
    setError('');
    try {
      await api(`/patients/${patient.id}`, { method: 'DELETE' });
      setNotice(`L’archive ${patient.medicalRecordNumber} a été supprimée définitivement.`);
      setDetail(null);
      await load(query, department, year);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const updatePolicy = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const updated = await api<ArchivePolicy>('/archives/policy', {
        method: 'PATCH',
        body: JSON.stringify({
          retentionYears: Number(policyForm.retentionYears),
          autoArchiveAfterMonths: policyForm.autoArchiveAfterMonths
            ? Number(policyForm.autoArchiveAfterMonths)
            : undefined,
          requireReason: policyForm.requireReason,
        }),
      });
      setPolicy(updated);
      setPolicyOpen(false);
      setNotice('La politique de conservation des archives a été mise à jour.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Configuration impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Conservation médico-administrative</span>
          <h1>Archives</h1>
          <p>
            {total.toLocaleString('fr-FR')} dossier(s) conservé(s) en lecture seule
            {policy ? ` · politique : ${policy.retentionYears} ans` : ''}
          </p>
        </div>
        {canManage && (
          <button className="secondary-button" onClick={() => setPolicyOpen(true)}>
            <Settings2 size={17} /> Politique de conservation
          </button>
        )}
      </div>

      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <section className="panel archive-summary">
        <Archive size={24} />
        <div>
          <strong>Une archive reste complète et restaurable</strong>
          <span>
            Les consultations, examens, factures, documents, hospitalisations, ordonnances et
            événements restent associés au numéro patient d’origine.
          </span>
        </div>
      </section>

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Numéro patient, nom, téléphone ou motif…"
          status={department}
          onStatusChange={setDepartment}
          allLabel="Tous les départements"
          statusOptions={departments.map((entry) => ({
            value: entry.value,
            label: `${departmentLabels[entry.value] ?? entry.value} (${entry.count})`,
          }))}
          resultCount={total}
        />
        <div className="archive-year-filter">
          <label className="field">
            <span>Année d’archivage</span>
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              <option value="">Toutes les années</option>
              {Array.from({ length: 15 }, (_, index) => new Date().getFullYear() - index).map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Référence</th>
                <th>Patient</th>
                <th>Classement</th>
                <th>Archivage</th>
                <th>Conservation</th>
                <th>Contenu</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Activity className="spin" /> Chargement des archives…
                    </div>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <FileClock size={30} />
                      <strong>Aucune archive trouvée</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((patient) => (
                  <tr
                    key={patient.id}
                    className="clickable-row"
                    onClick={() => void openDetail(patient)}
                  >
                    <td>
                      <strong>{patient.archiveReference ?? 'Archive historique'}</strong>
                      <span className="record-number">{patient.medicalRecordNumber}</span>
                    </td>
                    <td>
                      <strong>{patientName(patient)}</strong>
                      <br />
                      <span className="muted">{patient.phone || 'Téléphone non renseigné'}</span>
                    </td>
                    <td>
                      {departmentLabels[patient.archiveDepartment ?? 'GENERAL'] ??
                        patient.archiveDepartment}
                      <br />
                      <span className="muted">{patient.archiveReason}</span>
                    </td>
                    <td>
                      {new Intl.DateTimeFormat('fr-CD', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(patient.archivedAt))}
                      <br />
                      <span className="muted">par {patient.archivedBy?.username ?? 'Système'}</span>
                    </td>
                    <td>
                      {patient.retentionUntil
                        ? new Intl.DateTimeFormat('fr-CD').format(new Date(patient.retentionUntil))
                        : 'Non définie'}
                    </td>
                    <td>
                      {Object.values(patient._count).reduce((sum, value) => sum + value, 0)}{' '}
                      élément(s)
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <div className="row-actions">
                        <button className="text-button" onClick={() => void openDetail(patient)}>
                          <Eye size={15} /> Consulter
                        </button>
                        {canManage && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setRestoring(patient);
                              setRestoreReason('');
                            }}
                          >
                            <ArchiveRestore size={15} /> Restaurer
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {detailLoading && (
        <div className="global-loading-toast">
          <Activity className="spin" /> Ouverture du dossier archivé…
        </div>
      )}

      {detail && (
        <Modal
          title={`${detail.patient.medicalRecordNumber} — ${patientName(detail.patient)}`}
          eyebrow="Dossier archivé en lecture seule"
          onClose={() => setDetail(null)}
        >
          <div className="archive-detail-header">
            <div>
              <span>Motif</span>
              <strong>{detail.patient.archiveReason}</strong>
            </div>
            <div>
              <span>Classement</span>
              <strong>
                {departmentLabels[detail.patient.archiveDepartment ?? 'GENERAL'] ??
                  detail.patient.archiveDepartment}
              </strong>
            </div>
          </div>
          <div className="stats-grid compact-stats">
            {Object.entries(detail.counts).map(([key, value]) => (
              <article key={key}>
                <span>{countLabels[key] ?? key}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          {detail.customFields.length > 0 && (
            <section className="archive-custom-fields">
              <h3>Rubriques personnalisées</h3>
              <dl>
                {detail.customFields.map((field) => (
                  <div key={field.definition.label}>
                    <dt>{field.definition.label}</dt>
                    <dd>{String(field.value ?? '—')}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <section className="archive-timeline">
            <h3>Chronologie complète</h3>
            {detail.timeline.map((entry) => (
              <article key={`${entry.department}-${entry.id}`}>
                <time>
                  {new Intl.DateTimeFormat('fr-CD', { dateStyle: 'medium' }).format(
                    new Date(entry.date),
                  )}
                </time>
                <div>
                  <span>{departmentLabels[entry.department] ?? entry.department}</span>
                  <strong>{entry.title}</strong>
                  {entry.description && <p>{entry.description}</p>}
                </div>
                {entry.status && <StatusBadge status={entry.status} />}
              </article>
            ))}
          </section>
          <section className="archive-event-log">
            <h3>Journal d’archivage</h3>
            {detail.events.map((event) => (
              <article key={event.id}>
                <strong>{event.action === 'ARCHIVED' ? 'Archivé' : 'Restauré'}</strong>
                <span>
                  {event.reference} · {new Date(event.occurredAt).toLocaleString('fr-CD')} ·{' '}
                  {event.actor?.username ?? 'Système'}
                </span>
                <p>{event.reason}</p>
              </article>
            ))}
          </section>
          <div className="archive-export-actions">
            {(['pdf', 'xlsx', 'zip'] as const).map((format) => (
              <a
                className="secondary-button"
                href={apiUrl(`/archives/patients/${detail.patient.id}/export?format=${format}`)}
                key={format}
              >
                <Download size={15} /> {format.toUpperCase()}
              </a>
            ))}
            {canManage && (
              <button
                className="secondary-button"
                onClick={() => {
                  setRestoring(detail.patient);
                  setRestoreReason('');
                }}
              >
                <ArchiveRestore size={15} /> Restaurer
              </button>
            )}
            {canManage && (
              <button
                className="secondary-button danger"
                disabled={submitting}
                onClick={() => void removePermanently(detail.patient)}
              >
                <Trash2 size={15} /> Supprimer définitivement
              </button>
            )}
          </div>
        </Modal>
      )}

      {restoring && (
        <Modal
          title={`Restaurer ${restoring.medicalRecordNumber}`}
          eyebrow="Retour dans les dossiers actifs"
          onClose={() => setRestoring(null)}
        >
          <form onSubmit={restore}>
            <label className="field full">
              <span>Motif de restauration *</span>
              <textarea
                required
                minLength={10}
                maxLength={1000}
                rows={4}
                value={restoreReason}
                onChange={(event) => setRestoreReason(event.target.value)}
                placeholder="Expliquez pourquoi le dossier doit redevenir actif…"
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setRestoring(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                {submitting ? 'Restauration…' : 'Confirmer la restauration'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {policyOpen && (
        <Modal
          title="Politique de conservation"
          eyebrow="Archives patients"
          onClose={() => setPolicyOpen(false)}
        >
          <form onSubmit={updatePolicy}>
            <div className="form-grid">
              <label className="field">
                <span>Conservation par défaut (années) *</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="100"
                  value={policyForm.retentionYears}
                  onChange={(event) =>
                    setPolicyForm({ ...policyForm, retentionYears: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Inactivité avant archivage suggéré (mois)</span>
                <input
                  type="number"
                  min="1"
                  max="1200"
                  value={policyForm.autoArchiveAfterMonths}
                  onChange={(event) =>
                    setPolicyForm({ ...policyForm, autoArchiveAfterMonths: event.target.value })
                  }
                />
              </label>
              <label className="checkbox-field full">
                <input
                  type="checkbox"
                  checked={policyForm.requireReason}
                  onChange={(event) =>
                    setPolicyForm({ ...policyForm, requireReason: event.target.checked })
                  }
                />
                <span>Exiger un motif lors de chaque archivage et restauration</span>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setPolicyOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer la politique
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
