'use client';

import {
  Activity,
  BarChart3,
  Boxes,
  BriefcaseMedical,
  Droplets,
  Plus,
  Printer,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Modal } from '@/components/modal';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, patientName } from '@/lib/display';
import { hasAnyRole, hasRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

type Section = 'clinical' | 'blood' | 'insurance' | 'procurement' | 'reports';
interface Service {
  id: string;
  name: string;
  type: string;
  price: string;
}
interface Authorization {
  id: string;
  status: string;
  invoice: { id: string; number: string };
}
interface ClinicalOrder {
  id: string;
  type: string;
  status: string;
  priority: string;
  clinicalIndication: string;
  result?: string;
  createdAt: string;
  patient: Patient;
  service: Service;
  requestedBy: { username: string };
  careAuthorization?: Authorization;
  bloodTransfusion?: { id: string };
}
interface BloodUnit {
  id: string;
  code: string;
  bloodType: string;
  component: string;
  volumeMl: number;
  expiresAt: string;
  status: string;
}
interface Transfusion {
  id: string;
  status: string;
  indication: string;
  patient: Patient;
  bloodUnit: BloodUnit;
  clinicalOrder: ClinicalOrder;
}
interface Provider {
  id: string;
  code: string;
  name: string;
}
interface Policy {
  id: string;
  memberNumber: string;
  coveragePercent: string;
  patient: Patient;
  provider: Provider;
}
interface Invoice {
  id: string;
  number: string;
  total: string;
  patient: Patient;
}
interface Claim {
  id: string;
  reference: string;
  status: string;
  claimedAmount: string;
  approvedAmount?: string;
  patientInsurance: Policy;
  invoice: Invoice;
}
interface Supplier {
  id: string;
  code: string;
  name: string;
}
interface Medication {
  id: string;
  name: string;
}
interface PurchaseOrder {
  id: string;
  number: string;
  status: string;
  total: string;
  supplier: Supplier;
  items: Array<{ description: string; quantity: number; receivedQuantity: number }>;
}
interface Report {
  patients: number;
  invoices: number;
  payments: number;
  revenue: number;
  laboratoryExams: number;
  clinicalOrders: number;
  availableBloodUnits: number;
  pendingInsuranceClaims: number;
  openPurchaseOrders: number;
  lowStockMedications: number;
  paidInvoices: number;
}

const clinicalTypes = [
  'PROCEDURE',
  'RADIOLOGY',
  'SURGERY',
  'MATERNITY',
  'PEDIATRICS',
  'BLOOD_BANK',
  'OTHER',
];
const emptyClinical = {
  patientId: '',
  serviceId: '',
  clinicalIndication: '',
  priority: 'ROUTINE',
  scheduledAt: '',
  notes: '',
};
const emptyUnit = {
  code: '',
  bloodType: 'O+',
  component: 'Sang total',
  volumeMl: '450',
  donorReference: '',
  collectedAt: '',
  expiresAt: '',
  notes: '',
};

export default function OperationsPage() {
  const { user } = useAuth();
  const isAdmin = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);
  const finance = isAdmin || hasAnyRole(user, ['CASHIER', 'ACCOUNTANT']);
  const clinicalStaff =
    isAdmin ||
    hasAnyRole(user, ['DOCTOR', 'NURSE', 'LAB_TECHNICIAN', 'RADIOLOGIST', 'SURGEON', 'MIDWIFE']);
  const bloodStockStaff = isAdmin || hasAnyRole(user, ['LAB_TECHNICIAN', 'NURSE']);
  const transfusionStaff = isAdmin || hasAnyRole(user, ['DOCTOR', 'NURSE']);
  const insuranceStaff = isAdmin || hasAnyRole(user, ['RECEPTIONIST', 'SECRETARY', 'ACCOUNTANT']);
  const claimStaff = isAdmin || hasAnyRole(user, ['CASHIER', 'ACCOUNTANT']);
  const canSeeInsurance = insuranceStaff || claimStaff;
  const procurementStaff = isAdmin || hasRole(user, 'STOREKEEPER');
  const receivingStaff = procurementStaff || hasRole(user, 'PHARMACIST');
  const [section, setSection] = useState<Section>('clinical');
  const [orders, setOrders] = useState<ClinicalOrder[]>([]);
  const [units, setUnits] = useState<BloodUnit[]>([]);
  const [transfusions, setTransfusions] = useState<Transfusion[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<string | null>(null);
  const [clinicalForm, setClinicalForm] = useState(emptyClinical);
  const [unitForm, setUnitForm] = useState(emptyUnit);
  const [completeOrder, setCompleteOrder] = useState<ClinicalOrder | null>(null);
  const [result, setResult] = useState('');
  const [transfusionForm, setTransfusionForm] = useState({
    patientId: '',
    bloodUnitId: '',
    clinicalOrderId: '',
    indication: '',
    crossmatchReference: '',
    scheduledAt: '',
  });
  const [providerForm, setProviderForm] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
  });
  const [policyForm, setPolicyForm] = useState({
    patientId: '',
    providerId: '',
    memberNumber: '',
    coveragePercent: '100',
    validFrom: '',
    validUntil: '',
  });
  const [claimForm, setClaimForm] = useState({
    patientInsuranceId: '',
    invoiceId: '',
    claimedAmount: '',
    notes: '',
  });
  const [supplierForm, setSupplierForm] = useState({
    code: '',
    name: '',
    phone: '',
    email: '',
    address: '',
  });
  const [purchaseForm, setPurchaseForm] = useState({
    supplierId: '',
    medicationId: '',
    description: '',
    quantity: '1',
    unitCost: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        clinicalRows,
        bloodRows,
        transfusionRows,
        providerRows,
        policyRows,
        claimRows,
        supplierRows,
        purchaseRows,
        patientRows,
        serviceRows,
        medicationRows,
        reportRow,
        invoiceRows,
      ] = await Promise.all([
        clinicalStaff ? api<ClinicalOrder[]>('/operations/clinical-orders') : Promise.resolve([]),
        clinicalStaff ? api<BloodUnit[]>('/operations/blood-bank/units') : Promise.resolve([]),
        clinicalStaff
          ? api<Transfusion[]>('/operations/blood-bank/transfusions')
          : Promise.resolve([]),
        canSeeInsurance ? api<Provider[]>('/operations/insurance/providers') : Promise.resolve([]),
        canSeeInsurance ? api<Policy[]>('/operations/insurance/policies') : Promise.resolve([]),
        canSeeInsurance ? api<Claim[]>('/operations/insurance/claims') : Promise.resolve([]),
        receivingStaff ? api<Supplier[]>('/operations/procurement/suppliers') : Promise.resolve([]),
        receivingStaff
          ? api<PurchaseOrder[]>('/operations/procurement/orders')
          : Promise.resolve([]),
        clinicalStaff || insuranceStaff
          ? api<{ items: Patient[] }>('/patients/lookup?limit=200')
          : Promise.resolve({ items: [] }),
        clinicalStaff ? api<Service[]>('/billing/services') : Promise.resolve([]),
        receivingStaff ? api<Medication[]>('/pharmacy/medications') : Promise.resolve([]),
        isAdmin || hasRole(user, 'ACCOUNTANT')
          ? api<Report>('/operations/reports/summary')
          : Promise.resolve(null),
        finance ? api<Invoice[]>('/billing/invoices') : Promise.resolve([]),
      ]);
      setOrders(clinicalRows);
      setUnits(bloodRows);
      setTransfusions(transfusionRows);
      setProviders(providerRows);
      setPolicies(policyRows);
      setClaims(claimRows);
      setSuppliers(supplierRows);
      setPurchases(purchaseRows);
      setPatients(patientRows.items);
      setServices(serviceRows.filter((service) => clinicalTypes.includes(service.type)));
      setMedications(medicationRows);
      setReport(reportRow);
      setInvoices(invoiceRows);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [canSeeInsurance, clinicalStaff, finance, insuranceStaff, isAdmin, receivingStaff, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent, path: string, payload: unknown) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      setModal(null);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const patch = async (path: string, payload?: unknown) => {
    try {
      await api(path, { method: 'PATCH', body: payload ? JSON.stringify(payload) : undefined });
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Mise à jour impossible.');
    }
  };

  const completeClinical = async (event: FormEvent) => {
    event.preventDefault();
    if (!completeOrder) return;
    await patch(`/operations/clinical-orders/${completeOrder.id}`, { status: 'COMPLETED', result });
    setCompleteOrder(null);
    setResult('');
  };

  const tabs: Array<{ key: Section; label: string; icon: typeof Activity }> = [
    ...(clinicalStaff
      ? [
          { key: 'clinical' as const, label: 'Actes spécialisés', icon: BriefcaseMedical },
          { key: 'blood' as const, label: 'Transfusion sanguine', icon: Droplets },
        ]
      : []),
    ...(canSeeInsurance
      ? [{ key: 'insurance' as const, label: 'Assurances', icon: ShieldCheck }]
      : []),
    ...(receivingStaff
      ? [{ key: 'procurement' as const, label: 'Approvisionnements', icon: ShoppingCart }]
      : []),
    ...(isAdmin || hasRole(user, 'ACCOUNTANT')
      ? [{ key: 'reports' as const, label: 'Rapports', icon: BarChart3 }]
      : []),
  ];
  const firstVisibleSection = tabs[0]?.key;
  const currentSectionVisible = tabs.some((tab) => tab.key === section);

  useEffect(() => {
    if (!currentSectionVisible && firstVisibleSection) setSection(firstVisibleSection);
  }, [currentSectionVisible, firstVisibleSection]);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Plateforme hospitalière étendue</span>
          <h1>Services avancés</h1>
          <p>Radiologie, chirurgie, maternité, sang, assurances, achats et statistiques.</p>
        </div>
        <Boxes size={30} />
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="admin-tabs">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={section === key ? 'active' : ''}
            onClick={() => setSection(key)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>
      {loading && (
        <section className="panel empty-state">
          <Activity className="spin" /> Chargement…
        </section>
      )}

      {!loading && section === 'clinical' && (
        <section className="panel table-panel">
          <div className="panel-toolbar">
            <div>
              <strong>Actes et examens spécialisés</strong>
              <span>Paiement obligatoire avant le démarrage.</span>
            </div>
            {(isAdmin || hasRole(user, 'DOCTOR')) && (
              <button className="primary-button" onClick={() => setModal('clinical')}>
                <Plus size={16} /> Prescrire
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Acte</th>
                  <th>Priorité</th>
                  <th>Paiement</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{new Intl.DateTimeFormat('fr-FR').format(new Date(order.createdAt))}</td>
                    <td>
                      <strong>{patientName(order.patient)}</strong>
                      <br />
                      <span className="muted">{order.patient.medicalRecordNumber}</span>
                    </td>
                    <td>
                      {order.service.name}
                      <br />
                      <span className="muted">{order.clinicalIndication}</span>
                    </td>
                    <td>{order.priority}</td>
                    <td>
                      {order.careAuthorization ? (
                        <>
                          <StatusBadge status={order.careAuthorization.status} />
                          <br />
                          <span className="muted">{order.careAuthorization.invoice.number}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {clinicalStaff && ['REQUESTED', 'SCHEDULED'].includes(order.status) && (
                          <button
                            className="text-button"
                            disabled={
                              !order.careAuthorization ||
                              !['AUTHORIZED', 'WAIVED'].includes(order.careAuthorization.status)
                            }
                            onClick={() =>
                              void patch(`/operations/clinical-orders/${order.id}`, {
                                status: 'IN_PROGRESS',
                              })
                            }
                          >
                            Démarrer
                          </button>
                        )}
                        {clinicalStaff && order.status === 'IN_PROGRESS' && (
                          <button
                            className="text-button"
                            onClick={() => {
                              setCompleteOrder(order);
                              setResult(order.result ?? '');
                            }}
                          >
                            Compte rendu
                          </button>
                        )}
                        {clinicalStaff && order.status === 'COMPLETED' && (
                          <button
                            className="text-button"
                            onClick={() =>
                              void patch(`/operations/clinical-orders/${order.id}`, {
                                status: 'VALIDATED',
                              })
                            }
                          >
                            Valider
                          </button>
                        )}
                        {['COMPLETED', 'VALIDATED'].includes(order.status) && (
                          <Link
                            className="text-button"
                            href={`/print?kind=clinical&id=${order.id}`}
                            target="_blank"
                          >
                            <Printer size={14} /> Imprimer
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && section === 'blood' && (
        <div className="stack">
          <section className="panel table-panel">
            <div className="panel-toolbar">
              <div>
                <strong>Stock sanguin</strong>
                <span>Expiration et réservation contrôlées.</span>
              </div>
              {bloodStockStaff && (
                <button className="primary-button" onClick={() => setModal('unit')}>
                  <Plus size={16} /> Poche
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Groupe</th>
                    <th>Composant</th>
                    <th>Volume</th>
                    <th>Expiration</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit) => (
                    <tr key={unit.id}>
                      <td>{unit.code}</td>
                      <td>
                        <strong>{unit.bloodType}</strong>
                      </td>
                      <td>{unit.component}</td>
                      <td>{unit.volumeMl} ml</td>
                      <td>{new Intl.DateTimeFormat('fr-FR').format(new Date(unit.expiresAt))}</td>
                      <td>
                        <StatusBadge status={unit.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel table-panel">
            <div className="panel-toolbar">
              <div>
                <strong>Transfusions</strong>
                <span>Prescription, administration et réactions.</span>
              </div>
              {(isAdmin || hasRole(user, 'DOCTOR')) && (
                <button className="primary-button" onClick={() => setModal('transfusion')}>
                  <Plus size={16} /> Programmer
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Poche</th>
                    <th>Indication</th>
                    <th>État</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {transfusions.map((row) => (
                    <tr key={row.id}>
                      <td>{patientName(row.patient)}</td>
                      <td>
                        {row.bloodUnit.code} · {row.bloodUnit.bloodType}
                      </td>
                      <td>{row.indication}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {transfusionStaff && row.status === 'PLANNED' && (
                            <button
                              className="text-button"
                              disabled={
                                !row.clinicalOrder.careAuthorization ||
                                !['AUTHORIZED', 'WAIVED', 'CONSUMED'].includes(
                                  row.clinicalOrder.careAuthorization.status,
                                )
                              }
                              onClick={() =>
                                void patch(`/operations/blood-bank/transfusions/${row.id}`, {
                                  status: 'IN_PROGRESS',
                                })
                              }
                            >
                              Commencer
                            </button>
                          )}
                          {transfusionStaff && row.status === 'IN_PROGRESS' && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void patch(`/operations/blood-bank/transfusions/${row.id}`, {
                                  status: 'COMPLETED',
                                })
                              }
                            >
                              Terminer
                            </button>
                          )}
                          <Link
                            className="text-button"
                            href={`/print?kind=transfusion&id=${row.id}`}
                            target="_blank"
                          >
                            <Printer size={14} /> Fiche
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {!loading && section === 'insurance' && (
        <div className="stack">
          <section className="panel">
            <div className="panel-toolbar">
              <div>
                <strong>Organismes et polices</strong>
                <span>
                  {providers.length} organisme(s), {policies.length} police(s)
                </span>
              </div>
              <div className="row-actions">
                {isAdmin && (
                  <button className="secondary-button" onClick={() => setModal('provider')}>
                    <Plus size={15} /> Organisme
                  </button>
                )}
                {insuranceStaff && (
                  <button className="primary-button" onClick={() => setModal('policy')}>
                    <Plus size={15} /> Police patient
                  </button>
                )}
              </div>
            </div>
          </section>
          <section className="panel table-panel">
            <div className="panel-toolbar">
              <div>
                <strong>Sinistres et prises en charge</strong>
                <span>Suivi des montants réclamés et approuvés.</span>
              </div>
              {finance && (
                <button className="primary-button" onClick={() => setModal('claim')}>
                  <Plus size={16} /> Réclamation
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Référence</th>
                    <th>Patient</th>
                    <th>Assureur</th>
                    <th>Facture</th>
                    <th>Réclamé</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id}>
                      <td>{claim.reference}</td>
                      <td>{patientName(claim.patientInsurance.patient)}</td>
                      <td>{claim.patientInsurance.provider.name}</td>
                      <td>{claim.invoice.number}</td>
                      <td>{currency(claim.claimedAmount)}</td>
                      <td>
                        <StatusBadge status={claim.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {claimStaff && claim.status === 'DRAFT' && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void patch(`/operations/insurance/claims/${claim.id}`, {
                                  status: 'SUBMITTED',
                                })
                              }
                            >
                              Soumettre
                            </button>
                          )}
                          {claim.status === 'SUBMITTED' && isAdmin && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void patch(`/operations/insurance/claims/${claim.id}`, {
                                  status: 'APPROVED',
                                  approvedAmount: Number(claim.claimedAmount),
                                })
                              }
                            >
                              Approuver
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {!loading && section === 'procurement' && (
        <div className="stack">
          <section className="panel">
            <div className="panel-toolbar">
              <div>
                <strong>Fournisseurs</strong>
                <span>{suppliers.length} fournisseur(s) actif(s)</span>
              </div>
              {procurementStaff && (
                <button className="secondary-button" onClick={() => setModal('supplier')}>
                  <Plus size={15} /> Fournisseur
                </button>
              )}
            </div>
          </section>
          <section className="panel table-panel">
            <div className="panel-toolbar">
              <div>
                <strong>Bons de commande</strong>
                <span>La réception alimente automatiquement le stock médicament.</span>
              </div>
              {procurementStaff && (
                <button className="primary-button" onClick={() => setModal('purchase')}>
                  <Plus size={16} /> Commande
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Numéro</th>
                    <th>Fournisseur</th>
                    <th>Lignes</th>
                    <th>Total</th>
                    <th>État</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((order) => (
                    <tr key={order.id}>
                      <td>{order.number}</td>
                      <td>{order.supplier.name}</td>
                      <td>
                        {order.items
                          .map((item) => `${item.description} × ${item.quantity}`)
                          .join(', ')}
                      </td>
                      <td>{currency(order.total)}</td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {procurementStaff && order.status === 'DRAFT' && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void patch(`/operations/procurement/orders/${order.id}/order`)
                              }
                            >
                              Commander
                            </button>
                          )}
                          {receivingStaff && order.status === 'ORDERED' && (
                            <button
                              className="text-button"
                              onClick={() =>
                                void patch(`/operations/procurement/orders/${order.id}/receive`)
                              }
                            >
                              Réceptionner
                            </button>
                          )}
                          <Link
                            className="text-button"
                            href={`/print?kind=purchase&id=${order.id}`}
                            target="_blank"
                          >
                            <Printer size={14} /> Bon
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {!loading && section === 'reports' && report && (
        <section className="metric-grid report-grid">
          {[
            ['Patients actifs', report.patients],
            ['Factures', report.invoices],
            ['Factures payées', report.paidInvoices],
            ['Recettes', currency(report.revenue)],
            ['Examens laboratoire', report.laboratoryExams],
            ['Actes spécialisés', report.clinicalOrders],
            ['Poches disponibles', report.availableBloodUnits],
            ['Sinistres en attente', report.pendingInsuranceClaims],
            ['Commandes ouvertes', report.openPurchaseOrders],
            ['Médicaments en alerte', report.lowStockMedications],
          ].map(([label, value]) => (
            <article className="metric-card" key={label}>
              <BarChart3 />
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
      )}

      {modal === 'clinical' && (
        <Modal
          title="Prescrire un acte spécialisé"
          eyebrow="Paiement avant exécution"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/clinical-orders', {
                ...clinicalForm,
                scheduledAt: clinicalForm.scheduledAt || undefined,
              })
            }
          >
            <div className="form-grid">
              <PatientSelect
                patients={patients}
                value={clinicalForm.patientId}
                onChange={(patientId) => setClinicalForm({ ...clinicalForm, patientId })}
              />
              <label className="field full">
                <span>Acte tarifé *</span>
                <select
                  required
                  value={clinicalForm.serviceId}
                  onChange={(e) => setClinicalForm({ ...clinicalForm, serviceId: e.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name} — {currency(service.price)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Priorité</span>
                <select
                  value={clinicalForm.priority}
                  onChange={(e) => setClinicalForm({ ...clinicalForm, priority: e.target.value })}
                >
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Urgence vitale</option>
                </select>
              </label>
              <label className="field">
                <span>Date prévue</span>
                <input
                  type="datetime-local"
                  value={clinicalForm.scheduledAt}
                  onChange={(e) =>
                    setClinicalForm({ ...clinicalForm, scheduledAt: e.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Indication clinique *</span>
                <textarea
                  required
                  rows={4}
                  value={clinicalForm.clinicalIndication}
                  onChange={(e) =>
                    setClinicalForm({ ...clinicalForm, clinicalIndication: e.target.value })
                  }
                />
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}

      {modal === 'unit' && (
        <Modal
          title="Enregistrer une poche"
          eyebrow="Transfusion sanguine"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/blood-bank/units', {
                ...unitForm,
                volumeMl: Number(unitForm.volumeMl),
              })
            }
          >
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={unitForm.code}
                  onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Groupe *</span>
                <select
                  value={unitForm.bloodType}
                  onChange={(e) => setUnitForm({ ...unitForm, bloodType: e.target.value })}
                >
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Composant *</span>
                <input
                  required
                  value={unitForm.component}
                  onChange={(e) => setUnitForm({ ...unitForm, component: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Volume ml *</span>
                <input
                  required
                  type="number"
                  min="50"
                  value={unitForm.volumeMl}
                  onChange={(e) => setUnitForm({ ...unitForm, volumeMl: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Prélèvement *</span>
                <input
                  required
                  type="date"
                  value={unitForm.collectedAt}
                  onChange={(e) => setUnitForm({ ...unitForm, collectedAt: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Expiration *</span>
                <input
                  required
                  type="date"
                  value={unitForm.expiresAt}
                  onChange={(e) => setUnitForm({ ...unitForm, expiresAt: e.target.value })}
                />
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}

      {modal === 'transfusion' && (
        <Modal
          title="Programmer une transfusion"
          eyebrow="Double contrôle requis"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/blood-bank/transfusions', {
                ...transfusionForm,
                scheduledAt: transfusionForm.scheduledAt || undefined,
              })
            }
          >
            <div className="form-grid">
              <PatientSelect
                patients={patients}
                value={transfusionForm.patientId}
                onChange={(patientId) =>
                  setTransfusionForm({ ...transfusionForm, patientId, clinicalOrderId: '' })
                }
              />
              <label className="field full">
                <span>Acte de transfusion facturé *</span>
                <select
                  required
                  value={transfusionForm.clinicalOrderId}
                  onChange={(e) =>
                    setTransfusionForm({ ...transfusionForm, clinicalOrderId: e.target.value })
                  }
                >
                  <option value="">Sélectionner</option>
                  {orders
                    .filter(
                      (order) =>
                        order.type === 'BLOOD_BANK' &&
                        order.patient.id === transfusionForm.patientId &&
                        !order.bloodTransfusion &&
                        ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS'].includes(order.status),
                    )
                    .map((order) => (
                      <option value={order.id} key={order.id}>
                        {order.service.name} —{' '}
                        {order.careAuthorization?.invoice.number ?? 'Facture'}
                        {' — '}
                        {order.careAuthorization?.status ?? 'Paiement en attente'}
                      </option>
                    ))}
                </select>
                <small>
                  Créez d’abord l’acte avec un tarif BLOOD_BANK ; son paiement sera contrôlé au
                  démarrage.
                </small>
              </label>
              <label className="field full">
                <span>Poche compatible *</span>
                <select
                  required
                  value={transfusionForm.bloodUnitId}
                  onChange={(e) =>
                    setTransfusionForm({ ...transfusionForm, bloodUnitId: e.target.value })
                  }
                >
                  <option value="">Sélectionner</option>
                  {units
                    .filter((unit) => unit.status === 'AVAILABLE')
                    .map((unit) => (
                      <option value={unit.id} key={unit.id}>
                        {unit.code} — {unit.bloodType} — {unit.component}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field full">
                <span>Indication *</span>
                <textarea
                  required
                  value={transfusionForm.indication}
                  onChange={(e) =>
                    setTransfusionForm({ ...transfusionForm, indication: e.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Référence du cross-match validé *</span>
                <input
                  required
                  value={transfusionForm.crossmatchReference}
                  onChange={(e) =>
                    setTransfusionForm({
                      ...transfusionForm,
                      crossmatchReference: e.target.value,
                    })
                  }
                />
                <small>
                  La compatibilité doit être confirmée par le laboratoire avant la programmation.
                </small>
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}

      {modal === 'provider' && (
        <Modal title="Ajouter un organisme" eyebrow="Assurance" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/insurance/providers', providerForm)
            }
          >
            <SimpleOrganizationForm form={providerForm} setForm={setProviderForm} />
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}
      {modal === 'policy' && (
        <Modal
          title="Ajouter une police patient"
          eyebrow="Couverture"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/insurance/policies', {
                ...policyForm,
                coveragePercent: Number(policyForm.coveragePercent),
                validFrom: policyForm.validFrom || undefined,
                validUntil: policyForm.validUntil || undefined,
              })
            }
          >
            <div className="form-grid">
              <PatientSelect
                patients={patients}
                value={policyForm.patientId}
                onChange={(patientId) => setPolicyForm({ ...policyForm, patientId })}
              />
              <label className="field">
                <span>Organisme *</span>
                <select
                  required
                  value={policyForm.providerId}
                  onChange={(e) => setPolicyForm({ ...policyForm, providerId: e.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {providers.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>N° membre *</span>
                <input
                  required
                  value={policyForm.memberNumber}
                  onChange={(e) => setPolicyForm({ ...policyForm, memberNumber: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Couverture % *</span>
                <input
                  required
                  type="number"
                  min="0"
                  max="100"
                  value={policyForm.coveragePercent}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, coveragePercent: e.target.value })
                  }
                />
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}
      {modal === 'claim' && (
        <Modal title="Créer une réclamation" eyebrow="Assurance" onClose={() => setModal(null)}>
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/insurance/claims', {
                ...claimForm,
                claimedAmount: Number(claimForm.claimedAmount),
              })
            }
          >
            <div className="form-grid">
              <label className="field full">
                <span>Police *</span>
                <select
                  required
                  value={claimForm.patientInsuranceId}
                  onChange={(e) =>
                    setClaimForm({ ...claimForm, patientInsuranceId: e.target.value })
                  }
                >
                  <option value="">Sélectionner</option>
                  {policies.map((policy) => (
                    <option value={policy.id} key={policy.id}>
                      {patientName(policy.patient)} — {policy.provider.name} — {policy.memberNumber}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field full">
                <span>Facture *</span>
                <select
                  required
                  value={claimForm.invoiceId}
                  onChange={(e) => setClaimForm({ ...claimForm, invoiceId: e.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {invoices.map((invoice) => (
                    <option value={invoice.id} key={invoice.id}>
                      {invoice.number} — {patientName(invoice.patient)} — {currency(invoice.total)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Montant réclamé *</span>
                <input
                  required
                  type="number"
                  min="1"
                  value={claimForm.claimedAmount}
                  onChange={(e) => setClaimForm({ ...claimForm, claimedAmount: e.target.value })}
                />
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}

      {modal === 'supplier' && (
        <Modal
          title="Ajouter un fournisseur"
          eyebrow="Approvisionnement"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/procurement/suppliers', supplierForm)
            }
          >
            <SimpleOrganizationForm form={supplierForm} setForm={setSupplierForm} />
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}
      {modal === 'purchase' && (
        <Modal
          title="Créer un bon de commande"
          eyebrow="Approvisionnement"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(event) =>
              void submit(event, '/operations/procurement/orders', {
                supplierId: purchaseForm.supplierId,
                notes: purchaseForm.notes || undefined,
                items: [
                  {
                    medicationId: purchaseForm.medicationId || undefined,
                    description: purchaseForm.description,
                    quantity: Number(purchaseForm.quantity),
                    unitCost: Number(purchaseForm.unitCost),
                  },
                ],
              })
            }
          >
            <div className="form-grid">
              <label className="field full">
                <span>Fournisseur *</span>
                <select
                  required
                  value={purchaseForm.supplierId}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplierId: e.target.value })}
                >
                  <option value="">Sélectionner</option>
                  {suppliers.map((supplier) => (
                    <option value={supplier.id} key={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Médicament lié</span>
                <select
                  value={purchaseForm.medicationId}
                  onChange={(e) => {
                    const medication = medications.find((item) => item.id === e.target.value);
                    setPurchaseForm({
                      ...purchaseForm,
                      medicationId: e.target.value,
                      description: medication?.name ?? purchaseForm.description,
                    });
                  }}
                >
                  <option value="">Autre fourniture</option>
                  {medications.map((medication) => (
                    <option value={medication.id} key={medication.id}>
                      {medication.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Description *</span>
                <input
                  required
                  value={purchaseForm.description}
                  onChange={(e) =>
                    setPurchaseForm({ ...purchaseForm, description: e.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Quantité *</span>
                <input
                  required
                  type="number"
                  min="1"
                  value={purchaseForm.quantity}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Coût unitaire *</span>
                <input
                  required
                  type="number"
                  min="0"
                  value={purchaseForm.unitCost}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, unitCost: e.target.value })}
                />
              </label>
            </div>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}

      {completeOrder && (
        <Modal
          title={`Compte rendu — ${completeOrder.service.name}`}
          eyebrow={patientName(completeOrder.patient)}
          onClose={() => setCompleteOrder(null)}
        >
          <form onSubmit={completeClinical}>
            <label className="field">
              <span>Résultat / compte rendu *</span>
              <textarea
                required
                rows={10}
                value={result}
                onChange={(e) => setResult(e.target.value)}
              />
            </label>
            <ModalActions submitting={submitting} />
          </form>
        </Modal>
      )}
    </>
  );
}

function PatientSelect({
  patients,
  value,
  onChange,
}: {
  patients: Patient[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="field full">
      <span>Patient *</span>
      <select required value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Sélectionner</option>
        {patients.map((patient) => (
          <option key={patient.id} value={patient.id}>
            {patientName(patient)} — {patient.medicalRecordNumber}
          </option>
        ))}
      </select>
    </label>
  );
}

function ModalActions({ submitting }: { submitting: boolean }) {
  return (
    <div className="modal-actions">
      <button className="primary-button" disabled={submitting}>
        {submitting ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
}

function SimpleOrganizationForm<
  T extends { code: string; name: string; phone: string; email: string; address: string },
>({ form, setForm }: { form: T; setForm: (form: T) => void }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>Code *</span>
        <input
          required
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Nom *</span>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Téléphone</span>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </label>
      <label className="field">
        <span>E-mail</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>
      <label className="field full">
        <span>Adresse</span>
        <input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
      </label>
    </div>
  );
}
