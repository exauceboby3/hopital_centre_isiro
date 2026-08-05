'use client';

import {
  Activity,
  ClipboardList,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  Warehouse,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { api } from '@/lib/api';
import { hasAnyRole } from '@/lib/roles';
import './service-reports.css';

type ReportItem = {
  medicationId?: string;
  itemName: string;
  unit: string;
  openingStock: number;
  receivedQuantity: number;
  pendingOrder: number;
  usedQuantity: number;
  returnedQuantity: number;
  lostQuantity: number;
  closingStock?: number;
  unitCost?: number;
};

type Report = {
  id: string;
  reference: string;
  department: string;
  businessDate: string;
  shift?: string | null;
  status: string;
  newAdmissions: number;
  hospitalized: number;
  ambulatory: number;
  serviceTotal: number;
  items: ReportItem[];
  createdBy: { id: string; username: string };
};

type RequisitionItem = {
  id?: string;
  medicationId?: string;
  itemName: string;
  unit: string;
  quantityRequested: number;
  quantityApproved?: number;
  quantityIssued?: number;
  observations?: string;
};

type Requisition = {
  id: string;
  reference: string;
  department: string;
  priority: string;
  status: string;
  reason: string;
  items: RequisitionItem[];
  requestedBy: { username: string; role?: string };
  requestedAt?: string;
};

type Medication = {
  id: string;
  name: string;
  form?: string;
  strength?: string;
  stockQuantity: number;
  unitPrice?: number | string;
};
type AccountingSummary = {
  rows: Array<{
    id: string;
    reference: string;
    businessDate: string;
    department: string;
    shift?: string;
    status: string;
    patientCount: number;
    openingValue: number;
    receivedValue: number;
    returnedValue: number;
    usedValue: number;
    lostValue: number;
    closingValue: number;
    variance: number;
  }>;
  totals: {
    patients: number;
    openingValue: number;
    receivedValue: number;
    returnedValue: number;
    usedValue: number;
    lostValue: number;
    closingValue: number;
    variance: number;
  };
};

const departments = [
  'NURSING',
  'URGENCES',
  'MEDECINE_INTERNE',
  'PEDIATRIE',
  'GYNECO_OBSTETRIQUE',
  'MATERNITE',
  'CHIRURGIE',
  'LABORATOIRE',
  'PHARMACIE',
  'IMAGERIE',
  'RECEPTION',
  'CAISSE',
  'RESSOURCES_HUMAINES',
];

const blankReportItem = (): ReportItem => ({
  itemName: '',
  unit: 'unité',
  openingStock: 0,
  receivedQuantity: 0,
  pendingOrder: 0,
  usedQuantity: 0,
  returnedQuantity: 0,
  lostQuantity: 0,
  unitCost: 0,
});

const blankRequisitionItem = (): RequisitionItem => ({
  itemName: '',
  unit: 'unité',
  quantityRequested: 1,
  observations: '',
});

const today = new Date().toISOString().slice(0, 10);
const money = (value: number) => `${Math.round(value).toLocaleString('fr-CD')} CDF`;

export default function ServiceReportsPage() {
  const { user } = useAuth();
  const canAccount = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']);
  const canViewCosts = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canBrowseMedicationCatalog = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'PHARMACIST',
    'STOREKEEPER',
    'DOCTOR',
    'SURGEON',
    'MIDWIFE',
  ]);
  const canApprove = canAccount;
  const canFulfill = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'STOREKEEPER']);
  const [tab, setTab] = useState<'REPORTS' | 'REQUISITIONS' | 'ACCOUNTING'>('REPORTS');
  const [reports, setReports] = useState<Report[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [accounting, setAccounting] = useState<AccountingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [report, setReport] = useState({
    department: 'NURSING',
    businessDate: today,
    shift: 'JOUR',
    newAdmissions: 0,
    hospitalized: 0,
    ambulatory: 0,
    metrics: { MIH: 0, MIF: 0, PED: 0, GO: 0, MATERNITE: 0, CHIRURGIE: 0 },
    observations: '',
    items: [blankReportItem()],
  });
  const [requisition, setRequisition] = useState({
    department: 'LABORATOIRE',
    priority: 'ROUTINE',
    reason: '',
    notes: '',
    items: [blankRequisitionItem()],
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests: Promise<unknown>[] = [
        api<Report[]>('/service-reports'),
        api<Requisition[]>('/service-reports/requisitions/list'),
        canBrowseMedicationCatalog
          ? api<Medication[]>('/pharmacy/medications')
          : Promise.resolve([]),
      ];
      if (canAccount) requests.push(api<AccountingSummary>('/service-reports/accounting/summary'));
      const [reportRows, requisitionRows, medicationRows, accountingRows] =
        await Promise.all(requests);
      setReports(reportRows as Report[]);
      setRequisitions(requisitionRows as Requisition[]);
      setMedications(medicationRows as Medication[]);
      setAccounting((accountingRows as AccountingSummary | undefined) ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [canAccount, canBrowseMedicationCatalog]);

  useEffect(() => void load(), [load]);

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api('/service-reports', {
        method: 'POST',
        body: JSON.stringify({
          ...report,
          items: report.items.filter((item) => item.itemName.trim()),
        }),
      });
      setNotice('Rapport journalier enregistré avec calcul automatique du stock final.');
      setReport((current) => ({ ...current, observations: '', items: [blankReportItem()] }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  const submitRequisition = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api('/service-reports/requisitions', {
        method: 'POST',
        body: JSON.stringify({
          ...requisition,
          items: requisition.items.filter((item) => item.itemName.trim()),
        }),
      });
      setNotice('Réquisition soumise à la pharmacie et à l’administration.');
      setRequisition((current) => ({
        ...current,
        reason: '',
        notes: '',
        items: [blankRequisitionItem()],
      }));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Réquisition impossible.');
    } finally {
      setSaving(false);
    }
  };

  const updateReportStatus = async (id: string, status: string) => {
    setSaving(true);
    setError('');
    try {
      await api(`/service-reports/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`Rapport ${status.toLocaleLowerCase('fr')} avec succès.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mise à jour du rapport impossible.');
    } finally {
      setSaving(false);
    }
  };

  const approveRequisition = async (row: Requisition) => {
    setSaving(true);
    setError('');
    try {
      await api(`/service-reports/requisitions/${row.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: row.items.map((item) => ({
            itemId: item.id,
            quantityApproved: item.quantityRequested,
          })),
        }),
      });
      setNotice('Réquisition approuvée pour les quantités demandées.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Approbation impossible.');
    } finally {
      setSaving(false);
    }
  };

  const fulfillRequisition = async (row: Requisition) => {
    setSaving(true);
    setError('');
    try {
      await api(`/service-reports/requisitions/${row.id}/fulfill`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: row.items.map((item) => ({
            itemId: item.id,
            quantityIssued: Math.max(
              0,
              Number(item.quantityApproved ?? 0) - Number(item.quantityIssued ?? 0),
            ),
          })),
        }),
      });
      setNotice('Produits transférés du stock central vers le stock du service.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Livraison impossible.');
    } finally {
      setSaving(false);
    }
  };

  const reportTotal = report.newAdmissions + report.hospitalized + report.ambulatory;
  const reportValues = useMemo(
    () =>
      report.items.map((item) => ({
        ...item,
        closingStock:
          item.openingStock +
          item.receivedQuantity +
          item.returnedQuantity -
          item.usedQuantity -
          item.lostQuantity,
      })),
    [report.items],
  );

  const updateReportItem = (index: number, patch: Partial<ReportItem>) => {
    setReport((current) => ({
      ...current,
      items: current.items.map((item, rowIndex) =>
        rowIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const selectReportProduct = (index: number, value: string) => {
    const selected = medications.find(
      (medication) =>
        medication.name.toLocaleLowerCase('fr') === value.trim().toLocaleLowerCase('fr'),
    );
    updateReportItem(index, {
      itemName: value,
      medicationId: selected?.id,
      unitCost:
        canViewCosts && selected?.unitPrice !== undefined ? Number(selected.unitPrice) : undefined,
      unit: selected?.form?.trim() || report.items[index]?.unit || 'unité',
    });
  };

  const updateRequisitionItem = (index: number, patch: Partial<RequisitionItem>) => {
    setRequisition((current) => ({
      ...current,
      items: current.items.map((item, rowIndex) =>
        rowIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  if (loading)
    return (
      <section className="panel empty-state">
        <Activity className="spin" /> Chargement des rapports…
      </section>
    );

  return (
    <div className="service-report-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Rapports et réquisitions internes</span>
          <h1>Rapports journaliers des services</h1>
          <p>Modèle harmonisé pour nursing, laboratoire, pharmacie et tous les départements.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={17} /> Actualiser
        </button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}

      <div className="admin-tabs">
        <button className={tab === 'REPORTS' ? 'active' : ''} onClick={() => setTab('REPORTS')}>
          <ClipboardList size={16} /> Rapports
        </button>
        <button
          className={tab === 'REQUISITIONS' ? 'active' : ''}
          onClick={() => setTab('REQUISITIONS')}
        >
          <Send size={16} /> Réquisitions
        </button>
        {canAccount && (
          <button
            className={tab === 'ACCOUNTING' ? 'active' : ''}
            onClick={() => setTab('ACCOUNTING')}
          >
            <Warehouse size={16} /> Tableau comptable
          </button>
        )}
      </div>

      {tab === 'REPORTS' && (
        <>
          <form className="panel report-paper" onSubmit={submitReport}>
            <div className="report-paper-title">
              <span>Centre Hospitalier d’Isiro</span>
              <h2>Rapport journalier du service</h2>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Département</span>
                <select
                  value={report.department}
                  onChange={(event) => setReport({ ...report, department: event.target.value })}
                >
                  {departments.map((department) => (
                    <option key={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Date</span>
                <input
                  type="date"
                  required
                  value={report.businessDate}
                  onChange={(event) => setReport({ ...report, businessDate: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Garde / équipe</span>
                <input
                  value={report.shift}
                  onChange={(event) => setReport({ ...report, shift: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Nouveaux cas admis</span>
                <input
                  type="number"
                  min={0}
                  value={report.newAdmissions}
                  onChange={(event) =>
                    setReport({ ...report, newAdmissions: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>Hospitalisés</span>
                <input
                  type="number"
                  min={0}
                  value={report.hospitalized}
                  onChange={(event) =>
                    setReport({ ...report, hospitalized: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>Ambulatoires</span>
                <input
                  type="number"
                  min={0}
                  value={report.ambulatory}
                  onChange={(event) =>
                    setReport({ ...report, ambulatory: Number(event.target.value) })
                  }
                />
              </label>
              <label className="field">
                <span>Total du service</span>
                <input readOnly value={reportTotal} />
              </label>
            </div>
            <div className="report-metrics-grid">
              {Object.entries(report.metrics).map(([key, value]) => (
                <label className="field" key={key}>
                  <span>{key}</span>
                  <input
                    type="number"
                    min={0}
                    value={value}
                    onChange={(event) =>
                      setReport({
                        ...report,
                        metrics: { ...report.metrics, [key]: Number(event.target.value) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="table-scroll report-stock-table">
              <table>
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Médicament / consommable</th>
                    <th>Unité</th>
                    {canViewCosts && <th>Coût unitaire</th>}
                    <th>Stock d’entrée</th>
                    <th>Reçu</th>
                    <th>Commande en cours</th>
                    <th>Utilisé</th>
                    <th>Retours</th>
                    <th>Pertes</th>
                    <th>Reste</th>
                  </tr>
                </thead>
                <tbody>
                  {reportValues.map((item, index) => (
                    <tr key={index}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          required
                          value={item.itemName}
                          onChange={(event) => selectReportProduct(index, event.target.value)}
                          list="medication-options"
                        />
                      </td>
                      <td>
                        <input
                          required
                          value={item.unit}
                          onChange={(event) =>
                            updateReportItem(index, { unit: event.target.value })
                          }
                        />
                      </td>
                      {canViewCosts && (
                        <td>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitCost ?? 0}
                            disabled={Boolean(item.medicationId)}
                            title={
                              item.medicationId
                                ? 'Coût repris automatiquement du catalogue de la pharmacie.'
                                : 'Coût manuel pour un produit non référencé.'
                            }
                            onChange={(event) =>
                              updateReportItem(index, { unitCost: Number(event.target.value) })
                            }
                          />
                        </td>
                      )}
                      {(
                        [
                          'openingStock',
                          'receivedQuantity',
                          'pendingOrder',
                          'usedQuantity',
                          'returnedQuantity',
                          'lostQuantity',
                        ] as const
                      ).map((key) => (
                        <td key={key}>
                          <input
                            type="number"
                            min={0}
                            value={item[key]}
                            onChange={(event) =>
                              updateReportItem(index, { [key]: Number(event.target.value) })
                            }
                          />
                        </td>
                      ))}
                      <td>
                        <strong className={Number(item.closingStock) < 0 ? 'danger-text' : ''}>
                          {item.closingStock}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="medication-options">
              {medications.map((medication) => (
                <option key={medication.id} value={medication.name} />
              ))}
            </datalist>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setReport((current) => ({
                  ...current,
                  items: [...current.items, blankReportItem()],
                }))
              }
            >
              <Plus size={16} /> Ajouter une ligne
            </button>
            <label className="field full">
              <span>Observations</span>
              <textarea
                rows={3}
                value={report.observations}
                onChange={(event) => setReport({ ...report, observations: event.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button className="primary-button" disabled={saving}>
                Enregistrer le rapport
              </button>
            </div>
          </form>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Registre</span>
                <h2>Rapports enregistrés</h2>
              </div>
              <strong>{reports.length}</strong>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Service</th>
                    <th>Garde</th>
                    <th>Patients</th>
                    <th>Produits</th>
                    <th>Statut</th>
                    <th>Responsable</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.businessDate).toLocaleDateString('fr-CD')}</td>
                      <td>{row.department}</td>
                      <td>{row.shift ?? '—'}</td>
                      <td>{row.serviceTotal}</td>
                      <td>{row.items.length}</td>
                      <td>
                        {row.status}
                        <div className="row-actions">
                          {row.status === 'DRAFT' &&
                            (canAccount || row.createdBy.id === user?.id) && (
                              <button
                                className="text-button"
                                disabled={saving}
                                onClick={() => void updateReportStatus(row.id, 'SUBMITTED')}
                              >
                                Soumettre
                              </button>
                            )}
                          {canAccount && row.status === 'SUBMITTED' && (
                            <button
                              className="text-button"
                              disabled={saving}
                              onClick={() => void updateReportStatus(row.id, 'APPROVED')}
                            >
                              Approuver
                            </button>
                          )}
                          {canAccount && row.status === 'APPROVED' && (
                            <button
                              className="text-button"
                              disabled={saving}
                              onClick={() => void updateReportStatus(row.id, 'CLOSED')}
                            >
                              Clôturer
                            </button>
                          )}
                        </div>
                      </td>
                      <td>{row.createdBy.username}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {tab === 'REQUISITIONS' && (
        <div className="report-two-column">
          <form className="panel" onSubmit={submitRequisition}>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Modèle de réquisition</span>
                <h2>Nouvelle demande interne</h2>
              </div>
              <PackageCheck />
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Service demandeur</span>
                <select
                  value={requisition.department}
                  onChange={(event) =>
                    setRequisition({ ...requisition, department: event.target.value })
                  }
                >
                  {departments.map((department) => (
                    <option key={department}>{department}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Demandeur</span>
                <input readOnly value={user?.username ?? ''} />
              </label>
              <label className="field">
                <span>Fonction</span>
                <input readOnly value={user?.role ?? ''} />
              </label>
              <label className="field">
                <span>Priorité</span>
                <select
                  value={requisition.priority}
                  onChange={(event) =>
                    setRequisition({ ...requisition, priority: event.target.value })
                  }
                >
                  <option value="ROUTINE">Normale</option>
                  <option value="URGENT">Urgente</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </label>
              <label className="field full">
                <span>Motif de la demande</span>
                <textarea
                  required
                  minLength={5}
                  value={requisition.reason}
                  onChange={(event) =>
                    setRequisition({ ...requisition, reason: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Observations éventuelles</span>
                <textarea
                  value={requisition.notes}
                  onChange={(event) =>
                    setRequisition({ ...requisition, notes: event.target.value })
                  }
                />
              </label>
            </div>
            {requisition.items.map((item, index) => (
              <div className="requisition-line" key={index}>
                <label className="requisition-field product">
                  <span>Produit du catalogue</span>
                  <select
                    value={item.medicationId ?? ''}
                    onChange={(event) => {
                      const selected = medications.find(
                        (medication) => medication.id === event.target.value,
                      );
                      updateRequisitionItem(index, {
                        medicationId: event.target.value || undefined,
                        itemName: selected?.name ?? item.itemName,
                      });
                    }}
                  >
                    <option value="">Produit non référencé</option>
                    {medications.map((medication) => (
                      <option key={medication.id} value={medication.id}>
                        {medication.name} · stock {medication.stockQuantity}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="requisition-field designation">
                  <span>Désignation *</span>
                  <input
                    required
                    placeholder="Nom du produit demandé"
                    value={item.itemName}
                    onChange={(event) =>
                      updateRequisitionItem(index, { itemName: event.target.value })
                    }
                  />
                </label>
                <label className="requisition-field unit">
                  <span>Unité *</span>
                  <input
                    required
                    placeholder="Boîte, unité…"
                    value={item.unit}
                    onChange={(event) => updateRequisitionItem(index, { unit: event.target.value })}
                  />
                </label>
                <label className="requisition-field quantity">
                  <span>Quantité *</span>
                  <input
                    type="number"
                    min={1}
                    value={item.quantityRequested}
                    onChange={(event) =>
                      updateRequisitionItem(index, {
                        quantityRequested: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="requisition-field reason">
                  <span>Motif de cette ligne</span>
                  <input
                    placeholder="Pourquoi ce produit est demandé ?"
                    value={item.observations ?? ''}
                    onChange={(event) =>
                      updateRequisitionItem(index, { observations: event.target.value })
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setRequisition((current) => ({
                  ...current,
                  items: [...current.items, blankRequisitionItem()],
                }))
              }
            >
              <Plus size={16} /> Ajouter
            </button>
            <div className="modal-actions">
              <button className="primary-button" disabled={saving}>
                Soumettre la réquisition
              </button>
            </div>
          </form>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Suivi</span>
                <h2>Réquisitions</h2>
              </div>
              <strong>{requisitions.length}</strong>
            </div>
            <div className="requisition-cards">
              {requisitions.map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.reference}</strong>
                    <span>
                      {row.department} · {row.priority}
                    </span>
                    <small>{row.reason}</small>
                  </div>
                  <b>{row.status}</b>
                  <ul>
                    {row.items.map((item) => (
                      <li key={item.id}>
                        {item.itemName}: {item.quantityIssued ?? 0}/{item.quantityApproved ?? 0}/
                        {item.quantityRequested}
                      </li>
                    ))}
                  </ul>
                  <div className="row-actions">
                    {canApprove && row.status === 'SUBMITTED' && (
                      <button
                        className="text-button"
                        disabled={saving}
                        onClick={() => void approveRequisition(row)}
                      >
                        Approuver tout
                      </button>
                    )}
                    {canFulfill && ['APPROVED', 'PARTIALLY_FULFILLED'].includes(row.status) && (
                      <button
                        className="text-button"
                        disabled={saving}
                        onClick={() => void fulfillRequisition(row)}
                      >
                        Livrer le solde
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'ACCOUNTING' && canAccount && accounting && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Consolidation inter-départements</span>
              <h2>Tableau du comptable</h2>
            </div>
            <strong>{accounting.rows.length} rapport(s)</strong>
          </div>
          <div className="metric-grid">
            <article>
              <span>Patients</span>
              <strong>{accounting.totals.patients}</strong>
            </article>
            <article>
              <span>Consommé</span>
              <strong>{money(accounting.totals.usedValue)}</strong>
            </article>
            <article>
              <span>Pertes</span>
              <strong>{money(accounting.totals.lostValue)}</strong>
            </article>
            <article>
              <span>Stock final</span>
              <strong>{money(accounting.totals.closingValue)}</strong>
            </article>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Département</th>
                  <th>Patients</th>
                  <th>Ouverture</th>
                  <th>Entrées</th>
                  <th>Retours</th>
                  <th>Utilisé</th>
                  <th>Pertes</th>
                  <th>Clôture</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {accounting.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.businessDate).toLocaleDateString('fr-CD')}</td>
                    <td>{row.department}</td>
                    <td>{row.patientCount}</td>
                    <td>{money(row.openingValue)}</td>
                    <td>{money(row.receivedValue)}</td>
                    <td>{money(row.returnedValue)}</td>
                    <td>{money(row.usedValue)}</td>
                    <td>{money(row.lostValue)}</td>
                    <td>{money(row.closingValue)}</td>
                    <td className={Math.abs(row.variance) > 0.01 ? 'danger-text' : ''}>
                      {money(row.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
