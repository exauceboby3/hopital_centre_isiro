'use client';

import {
  Activity,
  BadgeDollarSign,
  CalendarCheck,
  Download,
  Eye,
  Pencil,
  Plus,
  Printer,
  Receipt,
  Settings2,
  ShieldAlert,
  TicketCheck,
  Trash2,
  WalletCards,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { PrintPreviewButton } from '@/components/print-preview-modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api, apiUrl } from '@/lib/api';
import { currency, matchesSearch, patientName } from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: string;
  total: string;
}
interface Payment {
  id: string;
  amount: string;
  paidAt: string;
  payerType: 'PATIENT' | 'INSURER' | 'SPONSOR';
}
interface CashClosure {
  id: string;
  businessDate: string;
  invoiceCount: number;
  paymentCount: number;
  totalBilled: string;
  totalCollected: string;
  cashTotal: string;
  mobileTotal: string;
  bankTotal: string;
  cardTotal: string;
  patientTotal: string;
  insurerTotal: string;
  sponsorTotal: string;
  notes?: string;
  closedAt: string;
  closedBy: { id: string; username: string };
}
interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string;
  issuedAt: string;
  patient: Patient;
  items: InvoiceItem[];
  payments: Payment[];
  careAuthorization?: { id: string; description: string; status: string };
  insuranceCoverage?: {
    status: string;
    patientAmount: string;
    insurerAmount: string;
    patientInsurance: { provider: { name: string } };
  };
  voucherCoverage?: {
    id: string;
    status: string;
    patientAmount: string;
    sponsorAmount: string;
    careVoucher: { id: string; number: string; issuerName: string };
  };
}
interface CareVoucher {
  id: string;
  number: string;
  issuerName: string;
  sponsorType: 'COMPANY' | 'INDIVIDUAL';
  coveragePercent: string;
  ceilingAmount?: string;
  usedAmount: string;
  validFrom?: string;
  validUntil?: string;
  status: string;
  patient?: Patient;
}
interface BillableService {
  id: string;
  code: string;
  name: string;
  type: string;
  price: string;
  requiresPrepayment: boolean;
  isActive: boolean;
}
interface Medication {
  id: string;
  name: string;
  stockQuantity: number;
  unitPrice: string;
}
interface ItemForm {
  description: string;
  quantity: string;
  unitPrice: string;
}
const emptyItem: ItemForm = { description: '', quantity: '1', unitPrice: '' };
const emptyCharge = {
  kind: 'SERVICE',
  patientId: '',
  serviceId: '',
  medicationId: '',
  quantity: '1',
};
const emptyService = {
  code: '',
  name: '',
  type: 'CONSULTATION',
  price: '',
  requiresPrepayment: true,
};
const emptyVoucher = {
  sponsorType: 'COMPANY' as 'COMPANY' | 'INDIVIDUAL',
  issuerName: '',
  ceilingAmount: '',
  validFrom: '',
  validUntil: '',
  notes: '',
};

export default function BillingPage() {
  const { user } = useAuth();
  const authorized = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'CASHIER',
    'ACCOUNTANT',
    'RECEPTIONIST',
    'SECRETARY',
  ]);
  const canCollectPayment = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canManageTariffs = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canAccessPharmacy = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'STOREKEEPER']);
  const [rows, setRows] = useState<Invoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [services, setServices] = useState<BillableService[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [vouchers, setVouchers] = useState<CareVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<BillableService | null>(null);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [allocating, setAllocating] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [waiving, setWaiving] = useState<Invoice | null>(null);
  const [waiverReason, setWaiverReason] = useState('');
  const [patientId, setPatientId] = useState('');
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItem }]);
  const [notes, setNotes] = useState('');
  const [payment, setPayment] = useState({
    amount: '',
    method: 'CASH',
    payerType: 'PATIENT',
    reference: '',
  });
  const [charge, setCharge] = useState(emptyCharge);
  const [service, setService] = useState(emptyService);
  const [serviceActive, setServiceActive] = useState(true);
  const [voucher, setVoucher] = useState(emptyVoucher);
  const [allocation, setAllocation] = useState({ careVoucherId: '', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [tariffQuery, setTariffQuery] = useState('');
  const [voucherQuery, setVoucherQuery] = useState('');
  const [closures, setClosures] = useState<CashClosure[]>([]);
  const [closureDate, setClosureDate] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  });
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [viewingGroup, setViewingGroup] = useState<{
    patient: Patient;
    invoices: Invoice[];
  } | null>(null);
  const [batchPayOpen, setBatchPayOpen] = useState(false);
  const load = useCallback(async () => {
    if (!authorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [invoices, patientRows, serviceRows, medicationRows, voucherRows, closureRows] =
        await Promise.all([
          api<Invoice[]>('/billing/invoices'),
          api<{ items: Patient[] }>('/patients/lookup?limit=100'),
          api<BillableService[]>(
            canManageTariffs ? '/billing/services?includeInactive=true' : '/billing/services',
          ),
          canAccessPharmacy ? api<Medication[]>('/pharmacy/medications') : Promise.resolve([]),
          api<CareVoucher[]>('/billing/vouchers'),
          canCollectPayment
            ? api<CashClosure[]>('/billing/invoices/closures')
            : Promise.resolve([]),
        ]);
      setRows(invoices);
      setPatients(patientRows.items);
      setServices(serviceRows);
      setMedications(medicationRows);
      setVouchers(voucherRows);
      setClosures(closureRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [authorized, canAccessPharmacy, canCollectPayment, canManageTariffs]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!authorized)
    return (
      <section className="panel restricted">
        <ShieldAlert size={36} />
        <h1>Accès financier réservé</h1>
        <p>Ce module est accessible à la caisse, au secrétariat et à l’administration.</p>
      </section>
    );
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          notes: notes || undefined,
          items: items.map((i) => ({
            description: i.description,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
        }),
      });
      setOpen(false);
      setPatientId('');
      setItems([{ ...emptyItem }]);
      setNotes('');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Facture impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const pay = async (e: FormEvent) => {
    e.preventDefault();
    if (!paying) return;
    setSubmitting(true);
    try {
      await api(`/billing/invoices/${paying.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          ...payment,
          amount: Number(payment.amount),
          reference: payment.reference || undefined,
        }),
      });
      setPaying(null);
      setPayment({ amount: '', method: 'CASH', payerType: 'PATIENT', reference: '' });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Paiement impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const payBatch = async (e: FormEvent) => {
    e.preventDefault();
    const invoiceIds = rows
      .filter(
        (invoice) =>
          selectedInvoiceIds.has(invoice.id) && !['PAID', 'CANCELLED'].includes(invoice.status),
      )
      .map((invoice) => invoice.id);
    if (invoiceIds.length === 0) return;
    setSubmitting(true);
    try {
      await api('/billing/invoices/payments/batch', {
        method: 'POST',
        body: JSON.stringify({
          invoiceIds,
          method: payment.method,
          payerType: 'PATIENT',
          reference: payment.reference || undefined,
        }),
      });
      setBatchPayOpen(false);
      setViewingGroup(null);
      setSelectedInvoiceIds(new Set());
      setPayment({ amount: '', method: 'CASH', payerType: 'PATIENT', reference: '' });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Encaissement groupé impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const createCharge = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(
        charge.kind === 'PHARMACY' ? '/billing/authorizations/pharmacy' : '/billing/authorizations',
        {
          method: 'POST',
          body: JSON.stringify(
            charge.kind === 'PHARMACY'
              ? {
                  patientId: charge.patientId,
                  medicationId: charge.medicationId,
                  quantity: Number(charge.quantity),
                }
              : { patientId: charge.patientId, serviceId: charge.serviceId },
          ),
        },
      );
      setChargeOpen(false);
      setCharge(emptyCharge);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Préparation du paiement impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const waive = async (e: FormEvent) => {
    e.preventDefault();
    if (!waiving?.careAuthorization) return;
    setSubmitting(true);
    try {
      await api(`/billing/authorizations/${waiving.careAuthorization.id}/waive`, {
        method: 'POST',
        body: JSON.stringify({ reason: waiverReason }),
      });
      setWaiving(null);
      setWaiverReason('');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Dérogation impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const createService = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api(editingService ? `/billing/services/${editingService.id}` : '/billing/services', {
        method: editingService ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...service,
          price: Number(service.price),
          ...(editingService ? { isActive: serviceActive } : {}),
        }),
      });
      setServiceOpen(false);
      setEditingService(null);
      setService(emptyService);
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Création du tarif impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const openService = (entry?: BillableService) => {
    setEditingService(entry ?? null);
    setServiceActive(entry?.isActive ?? true);
    setService(
      entry
        ? {
            code: entry.code,
            name: entry.name,
            type: entry.type,
            price: entry.price,
            requiresPrepayment: entry.requiresPrepayment,
          }
        : emptyService,
    );
    setServiceOpen(true);
  };
  const removeService = async (entry: BillableService) => {
    if (!window.confirm(`Supprimer ou désactiver le tarif « ${entry.name} » ?`)) return;
    try {
      await api(`/billing/services/${entry.id}`, { method: 'DELETE' });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suppression du tarif impossible.');
    }
  };
  const createVoucher = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api('/billing/vouchers', {
        method: 'POST',
        body: JSON.stringify({
          ...voucher,
          coveragePercent: 100,
          ceilingAmount: voucher.ceilingAmount ? Number(voucher.ceilingAmount) : undefined,
          validFrom: voucher.validFrom || undefined,
          validUntil: voucher.validUntil || undefined,
          notes: voucher.notes || undefined,
        }),
      });
      setVoucherOpen(false);
      setVoucher(emptyVoucher);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Création du bon de soins impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const allocateVoucher = async (event: FormEvent) => {
    event.preventDefault();
    if (!allocating) return;
    setSubmitting(true);
    setError('');
    try {
      await api('/billing/vouchers/allocate', {
        method: 'POST',
        body: JSON.stringify({
          invoiceId: allocating.id,
          careVoucherId: allocation.careVoucherId,
          reference: allocation.reference || undefined,
          notes: allocation.notes || undefined,
        }),
      });
      setAllocating(null);
      setAllocation({ careVoucherId: '', reference: '', notes: '' });
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Application du bon de soins impossible.',
      );
    } finally {
      setSubmitting(false);
    }
  };
  const closeCashDay = async () => {
    if (
      !window.confirm(
        `Clôturer définitivement la caisse du ${new Intl.DateTimeFormat('fr-FR').format(new Date(`${closureDate}T12:00:00`))} ?`,
      )
    )
      return;
    setSubmitting(true);
    setError('');
    try {
      await api('/billing/invoices/closures', {
        method: 'POST',
        body: JSON.stringify({ businessDate: closureDate }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Clôture journalière impossible.');
    } finally {
      setSubmitting(false);
    }
  };
  const remainingForPayer = (invoice: Invoice, payerType: string) => {
    const alreadyPaid = invoice.payments
      .filter((entry) => entry.payerType === payerType)
      .reduce((sum, entry) => sum + Number(entry.amount), 0);
    const limit =
      payerType === 'INSURER'
        ? Number(invoice.insuranceCoverage?.insurerAmount ?? 0)
        : payerType === 'SPONSOR'
          ? Number(invoice.voucherCoverage?.sponsorAmount ?? 0)
          : Number(
              invoice.insuranceCoverage?.patientAmount ??
                invoice.voucherCoverage?.patientAmount ??
                invoice.total,
            );
    return Math.max(0, limit - alreadyPaid);
  };
  const updateItem = (index: number, field: keyof ItemForm, value: string) =>
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  const eligibleVouchers = allocating
    ? vouchers.filter(
        (entry) =>
          (!entry.patient || entry.patient.id === allocating.patient.id) &&
          entry.status === 'ACTIVE',
      )
    : [];
  const selectedVoucher = eligibleVouchers.find((entry) => entry.id === allocation.careVoucherId);
  const sponsorPreview = allocating && selectedVoucher ? Number(allocating.total) : 0;
  const filteredServices = services.filter((entry) =>
    matchesSearch(tariffQuery, entry.code, entry.name, entry.type, entry.price),
  );
  const filteredVouchers = vouchers.filter((entry) =>
    matchesSearch(
      voucherQuery,
      entry.number,
      entry.patient ? patientName(entry.patient) : '',
      entry.patient?.medicalRecordNumber,
      entry.issuerName,
      entry.status,
    ),
  );
  const filteredRows = rows.filter(
    (row) =>
      (!invoiceStatus || row.status === invoiceStatus) &&
      matchesSearch(
        invoiceQuery,
        row.number,
        patientName(row.patient),
        row.patient.medicalRecordNumber,
        row.status,
        row.items.map((item) => item.description).join(' '),
        row.careAuthorization?.description,
      ),
  );
  const selectedClosure = closures.find(
    (closure) => closure.businessDate.slice(0, 10) === closureDate,
  );
  const invoiceGroups = Array.from(
    filteredRows
      .reduce<Map<string, { patient: Patient; invoices: Invoice[] }>>((groups, invoice) => {
        const group = groups.get(invoice.patient.id) ?? {
          patient: invoice.patient,
          invoices: [],
        };
        group.invoices.push(invoice);
        groups.set(invoice.patient.id, group);
        return groups;
      }, new Map())
      .values(),
  );
  const selectedInvoices = rows.filter((invoice) => selectedInvoiceIds.has(invoice.id));
  const selectedPayableInvoices = selectedInvoices.filter(
    (invoice) => !['PAID', 'CANCELLED'].includes(invoice.status),
  );
  const selectedInvoicesWithPayments = selectedInvoices.filter(
    (invoice) => invoice.payments.length > 0,
  );
  const groupedSelectionAllowed =
    selectedInvoices.length > 0 &&
    new Set(selectedInvoices.map((invoice) => invoice.patient.id)).size === 1;
  const groupedIds = selectedInvoices.map((invoice) => invoice.id).join(',');
  const selectedPatientBalance = selectedInvoices.reduce(
    (sum, invoice) => sum + remainingForPayer(invoice, 'PATIENT'),
    0,
  );
  const toggleInvoice = (invoiceId: string) =>
    setSelectedInvoiceIds((current) => {
      const next = new Set(current);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  const toggleInvoices = (invoices: Invoice[]) => {
    const selectable = invoices.filter((invoice) => invoice.status !== 'CANCELLED');
    setSelectedInvoiceIds((current) => {
      const next = new Set(current);
      const allSelected = selectable.every((invoice) => next.has(invoice.id));
      selectable.forEach((invoice) =>
        allSelected ? next.delete(invoice.id) : next.add(invoice.id),
      );
      return next;
    });
  };
  const invoiceActions = (row: Invoice) => (
    <div className="row-actions compact-actions">
      {canCollectPayment && !['PAID', 'CANCELLED'].includes(row.status) && (
        <button
          className="text-button"
          onClick={() => {
            const payerType =
              remainingForPayer(row, 'PATIENT') > 0
                ? 'PATIENT'
                : row.voucherCoverage
                  ? 'SPONSOR'
                  : row.insuranceCoverage
                    ? 'INSURER'
                    : 'PATIENT';
            setPaying(row);
            setPayment({
              ...payment,
              payerType,
              amount: String(remainingForPayer(row, payerType)),
            });
          }}
        >
          <WalletCards size={14} /> Encaisser
        </button>
      )}
      {!row.insuranceCoverage &&
        !row.voucherCoverage &&
        !['PAID', 'CANCELLED'].includes(row.status) && (
          <button
            className="text-button"
            onClick={() => {
              setAllocating(row);
              setAllocation({ careVoucherId: '', reference: '', notes: '' });
            }}
          >
            <TicketCheck size={14} /> Bon
          </button>
        )}
      <PrintPreviewButton
        src={`/print?kind=invoice&id=${row.id}`}
        title={`Facture ${row.number}`}
        subtitle={patientName(row.patient)}
      >
        <Printer size={14} /> Facture
      </PrintPreviewButton>
      {row.payments[0] && (
        <PrintPreviewButton
          src={`/print?kind=receipt&id=${row.id}&paymentId=${row.payments[0].id}`}
          title={`Reçu ${row.number}`}
          subtitle={patientName(row.patient)}
        >
          <Receipt size={14} /> Reçu
        </PrintPreviewButton>
      )}
      {hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']) &&
        row.careAuthorization?.status === 'PENDING' && (
          <button className="text-button danger" onClick={() => setWaiving(row)}>
            Urgence
          </button>
        )}
      <CustomFieldsEditor entity="INVOICE" entityId={row.id} />
    </div>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Caisse</span>
          <h1>Facturation</h1>
          <p>Factures, paiements et soldes patients.</p>
        </div>
        <div className="heading-actions">
          {canManageTariffs && (
            <button className="secondary-button" onClick={() => openService()}>
              <Settings2 size={18} /> Nouveau tarif
            </button>
          )}
          <button className="secondary-button" onClick={() => setVoucherOpen(true)}>
            <TicketCheck size={18} /> Nouveau bon de soins
          </button>
          <button className="secondary-button" onClick={() => setOpen(true)}>
            <Plus size={18} /> Facture libre
          </button>
          <button className="primary-button" onClick={() => setChargeOpen(true)}>
            <BadgeDollarSign size={18} /> Facturer un acte
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {canCollectPayment && (
        <section className="panel cash-closure-panel">
          <div className="cash-closure-heading">
            <div>
              <span className="eyebrow">Contrôle journalier</span>
              <h2>Clôture de caisse</h2>
            </div>
            <div className="cash-closure-controls">
              <input
                type="date"
                value={closureDate}
                onChange={(event) => setClosureDate(event.target.value)}
                aria-label="Journée de caisse"
              />
              {selectedClosure ? (
                <>
                  <span className="closure-locked">
                    <CalendarCheck size={15} /> Clôturée par {selectedClosure.closedBy.username}
                  </span>
                  <a
                    className="secondary-button compact-button"
                    href={apiUrl(
                      `/billing/invoices/closures/${selectedClosure.id}/export?format=pdf`,
                    )}
                  >
                    <Download size={14} /> PDF
                  </a>
                  <a
                    className="secondary-button compact-button"
                    href={apiUrl(
                      `/billing/invoices/closures/${selectedClosure.id}/export?format=xlsx`,
                    )}
                  >
                    <Download size={14} /> Excel
                  </a>
                </>
              ) : (
                <button
                  className="primary-button compact-button"
                  disabled={submitting || !closureDate}
                  onClick={() => void closeCashDay()}
                >
                  <CalendarCheck size={15} /> Clôturer la journée
                </button>
              )}
            </div>
          </div>
          {selectedClosure ? (
            <div className="cash-closure-summary">
              <span>
                Facturé <strong>{currency(selectedClosure.totalBilled)}</strong>
              </span>
              <span>
                Encaissé <strong>{currency(selectedClosure.totalCollected)}</strong>
              </span>
              <span>
                Espèces <strong>{currency(selectedClosure.cashTotal)}</strong>
              </span>
              <span>
                Mobile money <strong>{currency(selectedClosure.mobileTotal)}</strong>
              </span>
              <span>
                Banque/carte{' '}
                <strong>
                  {currency(Number(selectedClosure.bankTotal) + Number(selectedClosure.cardTotal))}
                </strong>
              </span>
            </div>
          ) : (
            <p className="muted closure-open-message">
              Journée ouverte. La clôture fige les totaux et crée les rapports détaillés PDF et
              Excel.
            </p>
          )}
        </section>
      )}
      {canManageTariffs && (
        <details className="panel voucher-register">
          <summary>
            <span>
              <Settings2 size={19} /> Catalogue tarifaire
            </span>
            <strong>{services.filter((entry) => entry.isActive).length} actif(s)</strong>
          </summary>
          <ListFilters
            query={tariffQuery}
            onQueryChange={setTariffQuery}
            placeholder="Code, acte, catégorie ou prix…"
            resultCount={filteredServices.length}
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Acte</th>
                  <th>Catégorie</th>
                  <th>Prix</th>
                  <th>Prépaiement</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredServices.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <span className="record-number">{entry.code}</span>
                    </td>
                    <td>{entry.name}</td>
                    <td>{entry.type}</td>
                    <td>{currency(entry.price)}</td>
                    <td>
                      <StatusBadge status={entry.requiresPrepayment ? 'ACTIVE' : 'WAIVED'} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-button" onClick={() => openService(entry)}>
                          <Pencil size={14} /> Modifier
                        </button>
                        <button
                          className="text-button danger"
                          onClick={() => void removeService(entry)}
                        >
                          <Trash2 size={14} /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <details className="panel voucher-register">
        <summary>
          <span>
            <TicketCheck size={19} /> Registre des bons de soins
          </span>
          <strong>{vouchers.filter((entry) => entry.status === 'ACTIVE').length} actif(s)</strong>
        </summary>
        <ListFilters
          query={voucherQuery}
          onQueryChange={setVoucherQuery}
          placeholder="Bon, patient, dossier ou organisme…"
          resultCount={filteredVouchers.length}
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bon</th>
                <th>Patient</th>
                <th>Organisme</th>
                <th>Couverture</th>
                <th>Plafond disponible</th>
                <th>Validité</th>
                <th>Statut</th>
                <th>Rubriques</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <span className="record-number">{entry.number}</span>
                  </td>
                  <td>
                    {entry.patient ? patientName(entry.patient) : 'Tous bénéficiaires'}
                    <br />
                    <span className="muted">
                      {entry.patient?.medicalRecordNumber ??
                        (entry.sponsorType === 'COMPANY' ? 'Société' : 'Personne garante')}
                    </span>
                  </td>
                  <td>{entry.issuerName}</td>
                  <td>{Number(entry.coveragePercent).toLocaleString('fr-FR')} %</td>
                  <td>
                    {entry.ceilingAmount
                      ? currency(
                          Math.max(0, Number(entry.ceilingAmount) - Number(entry.usedAmount)),
                        )
                      : 'Sans plafond'}
                  </td>
                  <td>
                    {entry.validUntil
                      ? `jusqu’au ${new Intl.DateTimeFormat('fr-FR').format(new Date(entry.validUntil))}`
                      : 'Non limitée'}
                  </td>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                  <td>
                    <CustomFieldsEditor entity="CARE_VOUCHER" entityId={entry.id} />
                  </td>
                </tr>
              ))}
              {filteredVouchers.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">Aucun bon de soins enregistré.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </details>
      <section className="panel table-panel">
        <ListFilters
          query={invoiceQuery}
          onQueryChange={setInvoiceQuery}
          placeholder="Facture, patient, dossier ou acte…"
          status={invoiceStatus}
          onStatusChange={setInvoiceStatus}
          statusOptions={[
            { value: 'DRAFT', label: 'Brouillon' },
            { value: 'PENDING', label: 'En attente' },
            { value: 'PARTIALLY_PAID', label: 'Partiellement payée' },
            { value: 'PAID', label: 'Payée' },
            { value: 'CANCELLED', label: 'Annulée' },
          ]}
          resultCount={invoiceGroups.length}
        />
        <div className="bulk-action-bar">
          <span>
            <strong>{selectedInvoiceIds.size}</strong> facture(s) sélectionnée(s)
          </span>
          <div className="bulk-action-buttons">
            <PrintPreviewButton
              className="secondary-button compact-button"
              disabled={!groupedSelectionAllowed}
              src={`/print?kind=grouped-invoice&ids=${encodeURIComponent(groupedIds)}`}
              title="Facture récapitulative"
            >
              <Printer size={15} /> Facture groupée
            </PrintPreviewButton>
            <PrintPreviewButton
              className="secondary-button compact-button"
              disabled={
                !groupedSelectionAllowed ||
                selectedInvoicesWithPayments.length !== selectedInvoices.length
              }
              src={`/print?kind=grouped-receipt&ids=${encodeURIComponent(groupedIds)}`}
              title="Reçu récapitulatif"
            >
              <Receipt size={15} /> Reçu groupé
            </PrintPreviewButton>
            {canCollectPayment && (
              <button
                className="primary-button compact-button"
                disabled={selectedPayableInvoices.length === 0}
                onClick={() => setBatchPayOpen(true)}
              >
                <WalletCards size={15} /> Encaisser ({selectedPayableInvoices.length})
              </button>
            )}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="selection-column">
                  <input
                    type="checkbox"
                    aria-label="Sélectionner toutes les factures visibles"
                    checked={
                      filteredRows.filter((invoice) => invoice.status !== 'CANCELLED').length > 0 &&
                      filteredRows
                        .filter((invoice) => invoice.status !== 'CANCELLED')
                        .every((invoice) => selectedInvoiceIds.has(invoice.id))
                    }
                    onChange={() =>
                      toggleInvoices(
                        filteredRows.filter((invoice) => invoice.status !== 'CANCELLED'),
                      )
                    }
                  />
                </th>
                <th>Patient</th>
                <th>Factures</th>
                <th>Dernière opération</th>
                <th>Total facturé</th>
                <th>Payé</th>
                <th>Solde</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Activity className="spin" />
                      Chargement…
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <Receipt />
                      <strong>Aucune facture</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                invoiceGroups.map((group) => {
                  const total = group.invoices.reduce(
                    (amount, invoice) => amount + Number(invoice.total),
                    0,
                  );
                  const paid = group.invoices.reduce(
                    (amount, invoice) =>
                      amount +
                      invoice.payments.reduce(
                        (invoicePaid, paymentRow) => invoicePaid + Number(paymentRow.amount),
                        0,
                      ),
                    0,
                  );
                  const selectable = group.invoices.filter(
                    (invoice) => invoice.status !== 'CANCELLED',
                  );
                  return (
                    <tr
                      className="patient-invoice-group clickable-row"
                      key={group.patient.id}
                      onClick={() => setViewingGroup(group)}
                    >
                      <td className="selection-column" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Sélectionner les factures de ${group.patient.medicalRecordNumber}`}
                          disabled={selectable.length === 0}
                          checked={
                            selectable.length > 0 &&
                            selectable.every((invoice) => selectedInvoiceIds.has(invoice.id))
                          }
                          onChange={() => toggleInvoices(group.invoices)}
                        />
                      </td>
                      <td className="patient-finance-identity">
                        <strong>{group.patient.medicalRecordNumber}</strong>
                        <span>{patientName(group.patient)}</span>
                      </td>
                      <td>
                        <strong>{group.invoices.length}</strong> facture(s)
                      </td>
                      <td>
                        {new Intl.DateTimeFormat('fr-FR').format(
                          new Date(group.invoices[0]!.issuedAt),
                        )}
                      </td>
                      <td>{currency(total)}</td>
                      <td>{currency(paid)}</td>
                      <td>
                        <strong className={total - paid > 0 ? 'balance-due' : 'balance-paid'}>
                          {currency(Math.max(0, total - paid))}
                        </strong>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setViewingGroup(group);
                          }}
                        >
                          <Eye size={15} /> Ouvrir
                        </button>
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
        <Modal
          title="Créer une facture libre"
          eyebrow="Opération administrative sans autorisation de soins"
          onClose={() => setOpen(false)}
        >
          <form onSubmit={create}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient"
                value={patientId}
                onChange={setPatientId}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
            </div>
            <div className="invoice-items">
              <div className="subheading">
                <strong>Prestations</strong>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setItems([...items, { ...emptyItem }])}
                >
                  <Plus size={15} />
                  Ajouter
                </button>
              </div>
              {items.map((item, index) => (
                <div className="invoice-item" key={index}>
                  <input
                    required
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Qté"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                  />
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Prix unitaire"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => setItems(items.filter((_, i) => i !== index))}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <label className="field">
              <span>Notes</span>
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Émettre la facture
              </button>
            </div>
          </form>
        </Modal>
      )}
      {chargeOpen && (
        <Modal
          title="Facturer avant le service"
          eyebrow="Autorisation de soins"
          onClose={() => setChargeOpen(false)}
        >
          <form onSubmit={createCharge}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient"
                value={charge.patientId}
                onChange={(patientId) => setCharge({ ...charge, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
              <label className="field">
                <span>Catégorie *</span>
                <select
                  value={charge.kind}
                  onChange={(e) =>
                    setCharge({ ...emptyCharge, patientId: charge.patientId, kind: e.target.value })
                  }
                >
                  <option value="SERVICE">Acte / séjour / procédure</option>
                  {canAccessPharmacy && <option value="PHARMACY">Médicament</option>}
                </select>
              </label>
              {charge.kind === 'SERVICE' ? (
                <label className="field">
                  <span>Acte *</span>
                  <select
                    required
                    value={charge.serviceId}
                    onChange={(e) => setCharge({ ...charge, serviceId: e.target.value })}
                  >
                    <option value="">Sélectionner</option>
                    {services
                      .filter((entry) => entry.isActive)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} — {currency(entry.price)}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="field">
                    <span>Médicament *</span>
                    <select
                      required
                      value={charge.medicationId}
                      onChange={(e) => setCharge({ ...charge, medicationId: e.target.value })}
                    >
                      <option value="">Sélectionner</option>
                      {medications.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name} — {currency(entry.unitPrice)} — stock {entry.stockQuantity}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Quantité *</span>
                    <input
                      required
                      type="number"
                      min="1"
                      value={charge.quantity}
                      onChange={(e) => setCharge({ ...charge, quantity: e.target.value })}
                    />
                  </label>
                </>
              )}
            </div>
            <div className="alert info">
              Le patient restera bloqué pour cet acte jusqu’au paiement intégral de la facture.
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setChargeOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Créer la facture à payer
              </button>
            </div>
          </form>
        </Modal>
      )}
      {serviceOpen && (
        <Modal
          title={editingService ? 'Modifier le tarif' : 'Ajouter un tarif'}
          eyebrow="Catalogue des actes"
          onClose={() => {
            setServiceOpen(false);
            setEditingService(null);
          }}
        >
          <form onSubmit={createService}>
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={service.code}
                  onChange={(e) => setService({ ...service, code: e.target.value })}
                />
              </label>
              {editingService && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={serviceActive}
                    onChange={(event) => setServiceActive(event.target.checked)}
                  />{' '}
                  Tarif actif
                </label>
              )}
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={service.requiresPrepayment}
                  onChange={(event) =>
                    setService({ ...service, requiresPrepayment: event.target.checked })
                  }
                />{' '}
                Paiement préalable obligatoire
              </label>
              <label className="field">
                <span>Catégorie *</span>
                <select
                  value={service.type}
                  onChange={(e) => setService({ ...service, type: e.target.value })}
                >
                  <option value="CONSULTATION">Consultation</option>
                  <option value="LABORATORY">Examen de laboratoire</option>
                  <option value="HOSPITALIZATION">Hospitalisation</option>
                  <option value="PROCEDURE">Acte / procédure</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="field full">
                <span>Libellé *</span>
                <input
                  required
                  value={service.name}
                  onChange={(e) => setService({ ...service, name: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Prix (CDF) *</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={service.price}
                  onChange={(e) => setService({ ...service, price: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setServiceOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer le tarif
              </button>
            </div>
          </form>
        </Modal>
      )}
      {voucherOpen && (
        <Modal
          title="Enregistrer un bon de soins"
          eyebrow="Prise en charge par organisme"
          onClose={() => setVoucherOpen(false)}
        >
          <form onSubmit={createVoucher}>
            <div className="form-grid">
              <label className="field">
                <span>Type de garant *</span>
                <select
                  required
                  value={voucher.sponsorType}
                  onChange={(event) =>
                    setVoucher({
                      ...voucher,
                      sponsorType: event.target.value as 'COMPANY' | 'INDIVIDUAL',
                    })
                  }
                >
                  <option value="COMPANY">Société</option>
                  <option value="INDIVIDUAL">Personne</option>
                </select>
              </label>
              <label className="field">
                <span>Nom de la société ou du garant *</span>
                <input
                  required
                  minLength={2}
                  maxLength={160}
                  value={voucher.issuerName}
                  onChange={(event) => setVoucher({ ...voucher, issuerName: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Plafond total (CDF)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={voucher.ceilingAmount}
                  onChange={(event) =>
                    setVoucher({ ...voucher, ceilingAmount: event.target.value })
                  }
                />
                <small>Vide = aucun plafond monétaire.</small>
              </label>
              <label className="field">
                <span>Valide à partir du</span>
                <input
                  type="date"
                  value={voucher.validFrom}
                  onChange={(event) => setVoucher({ ...voucher, validFrom: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Valide jusqu’au</span>
                <input
                  type="date"
                  value={voucher.validUntil}
                  onChange={(event) => setVoucher({ ...voucher, validUntil: event.target.value })}
                />
              </label>
              <label className="field full">
                <span>Conditions / notes</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={voucher.notes}
                  onChange={(event) => setVoucher({ ...voucher, notes: event.target.value })}
                />
              </label>
              <div className="alert info full">
                Le numéro du bon sera généré automatiquement lors de l’enregistrement.
              </div>
            </div>
            <div className="alert info">
              Toute la facture est imputée au garant. Le plafond est uniquement suivi et peut être
              dépassé sans demander un paiement au patient.
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setVoucherOpen(false)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer le bon
              </button>
            </div>
          </form>
        </Modal>
      )}
      {allocating && (
        <Modal
          title="Appliquer un bon de soins"
          eyebrow={`${allocating.number} — ${patientName(allocating.patient)}`}
          onClose={() => setAllocating(null)}
        >
          <form onSubmit={allocateVoucher}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Bon actif à attribuer au patient"
                value={allocation.careVoucherId}
                onChange={(careVoucherId) => setAllocation({ ...allocation, careVoucherId })}
                options={eligibleVouchers.map((entry) => ({
                  value: entry.id,
                  label: `${entry.number} — ${entry.issuerName}`,
                  description: `${entry.sponsorType === 'COMPANY' ? 'Société' : 'Personne'} · ${entry.ceilingAmount ? `plafond indicatif ${currency(entry.ceilingAmount)}` : 'sans plafond'}`,
                }))}
              />
              <label className="field">
                <span>Référence d’accord</span>
                <input
                  maxLength={100}
                  value={allocation.reference}
                  onChange={(event) =>
                    setAllocation({ ...allocation, reference: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Notes</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={allocation.notes}
                  onChange={(event) => setAllocation({ ...allocation, notes: event.target.value })}
                />
              </label>
            </div>
            {selectedVoucher ? (
              <div className="coverage-preview">
                <span>
                  Total facture <strong>{currency(allocating.total)}</strong>
                </span>
                <span>
                  Part organisme <strong>{currency(sponsorPreview)}</strong>
                </span>
                <span>
                  Part patient à régler{' '}
                  <strong>{currency(Number(allocating.total) - sponsorPreview)}</strong>
                </span>
              </div>
            ) : eligibleVouchers.length === 0 ? (
              <div className="alert error">
                Aucun bon actif n’est disponible. Enregistrez d’abord le bon de la société ou de la
                personne garante.
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAllocating(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || !selectedVoucher}>
                Confirmer la répartition
              </button>
            </div>
          </form>
        </Modal>
      )}
      {viewingGroup && (
        <Modal
          title={viewingGroup.patient.medicalRecordNumber}
          eyebrow={patientName(viewingGroup.patient)}
          onClose={() => setViewingGroup(null)}
        >
          <div className="modal-list compact-modal-list">
            {viewingGroup.invoices.map((invoice) => {
              const paid = invoice.payments.reduce((sum, entry) => sum + Number(entry.amount), 0);
              const selectable = invoice.status !== 'CANCELLED';
              return (
                <article className="invoice-modal-row" key={invoice.id}>
                  <input
                    type="checkbox"
                    disabled={!selectable}
                    checked={selectedInvoiceIds.has(invoice.id)}
                    onChange={() => toggleInvoice(invoice.id)}
                    aria-label={`Sélectionner ${invoice.number}`}
                  />
                  <div>
                    <strong>{invoice.number}</strong>
                    <span>
                      {invoice.careAuthorization?.description ??
                        invoice.items.map((item) => item.description).join(', ')}
                    </span>
                  </div>
                  <div className="invoice-modal-amount">
                    <strong>{currency(invoice.total)}</strong>
                    <span>Payé : {currency(paid)}</span>
                  </div>
                  <StatusBadge status={invoice.status} />
                  {invoiceActions(invoice)}
                </article>
              );
            })}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setViewingGroup(null)}>
              Fermer
            </button>
            <PrintPreviewButton
              className="secondary-button"
              disabled={!groupedSelectionAllowed}
              src={`/print?kind=grouped-invoice&ids=${encodeURIComponent(groupedIds)}`}
              title="Facture récapitulative"
              subtitle={patientName(viewingGroup.patient)}
            >
              <Printer size={16} /> Facture groupée
            </PrintPreviewButton>
            <PrintPreviewButton
              className="secondary-button"
              disabled={
                !groupedSelectionAllowed ||
                selectedInvoicesWithPayments.length !== selectedInvoices.length
              }
              src={`/print?kind=grouped-receipt&ids=${encodeURIComponent(groupedIds)}`}
              title="Reçu récapitulatif"
              subtitle={patientName(viewingGroup.patient)}
            >
              <Receipt size={16} /> Reçu groupé
            </PrintPreviewButton>
            {canCollectPayment && (
              <button
                className="primary-button"
                disabled={selectedPayableInvoices.length === 0}
                onClick={() => {
                  setViewingGroup(null);
                  setBatchPayOpen(true);
                }}
              >
                <WalletCards size={16} /> Encaisser ({selectedPayableInvoices.length})
              </button>
            )}
          </div>
        </Modal>
      )}
      {batchPayOpen && (
        <Modal
          title="Encaissement groupé"
          eyebrow={`${selectedPayableInvoices.length} facture(s) à encaisser`}
          onClose={() => setBatchPayOpen(false)}
        >
          <form onSubmit={payBatch}>
            <div className="batch-payment-summary">
              <span>Part patient totale à encaisser</span>
              <strong>{currency(selectedPatientBalance)}</strong>
              <small>
                Chaque facture recevra sa propre ligne de paiement et conservera son reçu.
              </small>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Mode *</span>
                <select
                  value={payment.method}
                  onChange={(event) => setPayment({ ...payment, method: event.target.value })}
                >
                  <option value="CASH">Espèces</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="BANK_TRANSFER">Virement</option>
                  <option value="CARD">Carte</option>
                </select>
              </label>
              <label className="field">
                <span>Payeur</span>
                <input value="Patient" disabled />
              </label>
              <label className="field full">
                <span>Référence commune</span>
                <input
                  value={payment.reference}
                  onChange={(event) => setPayment({ ...payment, reference: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setBatchPayOpen(false)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={submitting || selectedPatientBalance <= 0}
              >
                Confirmer tous les paiements
              </button>
            </div>
          </form>
        </Modal>
      )}
      {paying && (
        <Modal
          title={`Encaisser ${paying.number}`}
          eyebrow={patientName(paying.patient)}
          onClose={() => setPaying(null)}
        >
          <form onSubmit={pay}>
            <div className="form-grid">
              <label className="field">
                <span>Montant *</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) => setPayment({ ...payment, amount: e.target.value })}
                />
              </label>
              <label className="field">
                <span>Mode *</span>
                <select
                  value={payment.method}
                  onChange={(e) => setPayment({ ...payment, method: e.target.value })}
                >
                  <option value="CASH">Espèces</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="BANK_TRANSFER">Virement</option>
                  <option value="CARD">Carte</option>
                </select>
              </label>
              <label className="field">
                <span>Payeur *</span>
                <select
                  value={payment.payerType}
                  onChange={(event) => {
                    const payerType = event.target.value;
                    setPayment({
                      ...payment,
                      payerType,
                      amount: String(remainingForPayer(paying, payerType)),
                    });
                  }}
                >
                  <option value="PATIENT">Patient</option>
                  {paying.insuranceCoverage && <option value="INSURER">Assureur</option>}
                  {paying.voucherCoverage && <option value="SPONSOR">Organisme du bon</option>}
                </select>
              </label>
              <label className="field full">
                <span>Référence</span>
                <input
                  value={payment.reference}
                  onChange={(e) => setPayment({ ...payment, reference: e.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setPaying(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Confirmer le paiement
              </button>
            </div>
          </form>
        </Modal>
      )}
      {waiving?.careAuthorization && (
        <Modal
          title="Dérogation d’urgence"
          eyebrow={`${waiving.number} — ${patientName(waiving.patient)}`}
          onClose={() => setWaiving(null)}
        >
          <form onSubmit={waive}>
            <div className="alert error">
              Cette action autorise les soins sans paiement intégral. Elle est nominative, horodatée
              et conservée dans le journal d’audit.
            </div>
            <label className="field">
              <span>Motif médical ou vital *</span>
              <textarea
                required
                minLength={10}
                maxLength={1000}
                rows={5}
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setWaiving(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Autoriser l’urgence
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
