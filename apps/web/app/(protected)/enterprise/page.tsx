'use client';

import {
  Activity,
  BookOpenCheck,
  Boxes,
  CalendarClock,
  Download,
  FileHeart,
  Image as ImageIcon,
  Pill,
  Plus,
  ReceiptText,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, patientName } from '@/lib/display';
import { resilientApi } from '@/lib/offline-queue';
import { hasAnyRole } from '@/lib/roles';
import { Patient, Role, User } from '@/lib/types';

type Section =
  'insurance' | 'prescriptions' | 'pharmacy' | 'specialties' | 'radiology' | 'hr' | 'accounting';
interface Medication {
  id: string;
  name: string;
  strength?: string;
  stockQuantity: number;
  unitPrice: string;
}
interface Policy {
  id: string;
  memberNumber: string;
  coveragePercent: string;
  patient: Patient;
  provider: { name: string };
}
interface Invoice {
  id: string;
  number: string;
  total: string;
  patient: Patient;
}
interface ClinicalOrder {
  id: string;
  type: string;
  status: string;
  patient: Patient;
  service: { name: string };
}
interface Coverage {
  id: string;
  status: string;
  patientAmount: string;
  insurerAmount: string;
  guaranteeReference?: string;
  invoice: Invoice;
  patientInsurance: Policy;
}
interface Prescription {
  id: string;
  number: string;
  status: string;
  prescribedAt: string;
  patient: Patient;
  invoice: { id: string; number: string; status: string };
  items: Array<{
    id: string;
    dosage: string;
    frequency: string;
    route: string;
    durationDays: number;
    quantity: number;
    medicationId?: string;
    medicationName: string;
    availability: string;
    medication?: Medication | null;
  }>;
}
interface Batch {
  id: string;
  lotNumber: string;
  quantity: number;
  expiresAt: string;
  isQuarantined: boolean;
  medication: Medication;
}
interface Inventory {
  id: string;
  reference: string;
  status: string;
  startedAt: string;
  lines: Array<{ difference: number; medication: Medication }>;
}
interface SpecialtyCase {
  id: string;
  specialty: string;
  title: string;
  status: string;
  patient: Patient;
  clinicalOrder?: ClinicalOrder;
}
interface RadiologyStudy {
  id: string;
  accessionNumber: string;
  modality: string;
  bodyPart: string;
  status: string;
  patient: Patient;
  studyInstanceUid?: string;
  pacsViewerUrl?: string;
  instances: unknown[];
}
interface Shift {
  id: string;
  service: string;
  startsAt: string;
  endsAt: string;
  status: string;
  employee: User;
}
interface Attendance {
  id: string;
  date: string;
  status: string;
  minutesLate: number;
  employee: User;
}
interface Payroll {
  id: string;
  label: string;
  status: string;
  startsOn: string;
  endsOn: string;
  entries: Array<{ id: string; netSalary: string; status: string; employee: User }>;
}
interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}
interface Journal {
  id: string;
  number: string;
  date: string;
  description: string;
  status: string;
  lines: Array<{ debit: string; credit: string; account: Account }>;
}
interface UtilityBill {
  id: string;
  type: 'ELECTRICITY' | 'WATER' | 'INTERNET';
  periodStart: string;
  provider: string;
  reference?: string;
  amount: string;
  dueAt?: string;
  paidAt?: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED';
}
interface EnterpriseReport {
  insurance: { count: number; insurerAmount: number; patientAmount: number };
  prescriptions: number;
  expiredBatches: number;
  specialtyCases: number;
  radiologyStudies: number;
  payroll: { entries: number; netTotal: number };
  accounting: { debit: number; credit: number };
}

const clinicalRoles: Role[] = ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE', 'NURSE'];
const financialRoles: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'CASHIER',
  'ACCOUNTANT',
  'RECEPTIONIST',
  'SECRETARY',
];
const sections: Array<{
  id: Section;
  label: string;
  icon: typeof ShieldCheck;
  roles: Role[];
}> = [
  { id: 'insurance', label: 'Assurance', icon: ShieldCheck, roles: financialRoles },
  {
    id: 'prescriptions',
    label: 'Prescriptions',
    icon: Pill,
    roles: [...clinicalRoles, 'PHARMACIST', 'STOREKEEPER'],
  },
  {
    id: 'pharmacy',
    label: 'Lots & inventaires',
    icon: Boxes,
    roles: ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST', 'STOREKEEPER'],
  },
  { id: 'specialties', label: 'Dossiers spécialisés', icon: FileHeart, roles: clinicalRoles },
  {
    id: 'radiology',
    label: 'PACS / DICOM',
    icon: ImageIcon,
    roles: ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST', 'DOCTOR'],
  },
  {
    id: 'hr',
    label: 'Gardes & paie',
    icon: UsersRound,
    roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
  {
    id: 'accounting',
    label: 'Comptabilité & rapports',
    icon: BookOpenCheck,
    roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
  },
];
const emptyPrescriptionItem = {
  medicationId: '',
  dosage: '',
  frequency: '',
  route: 'Orale',
  durationDays: '1',
  quantity: '1',
  instructions: '',
};
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

async function optional<T>(path: string, fallback: T): Promise<T> {
  try {
    return await api<T>(path);
  } catch {
    return fallback;
  }
}

export default function EnterprisePage() {
  const { user } = useAuth();
  const [section, setSection] = useState<Section>('insurance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<ClinicalOrder[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [coverages, setCoverages] = useState<Coverage[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [specialties, setSpecialties] = useState<SpecialtyCase[]>([]);
  const [studies, setStudies] = useState<RadiologyStudy[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journal, setJournal] = useState<Journal[]>([]);
  const [utilityBills, setUtilityBills] = useState<UtilityBill[]>([]);
  const [report, setReport] = useState<EnterpriseReport | null>(null);
  const [coverageForm, setCoverageForm] = useState({
    invoiceId: '',
    patientInsuranceId: '',
    guaranteeReference: '',
  });
  const [prescriptionForm, setPrescriptionForm] = useState({
    patientId: '',
    diagnosis: '',
    generalInstructions: '',
    interactionOverrideReason: '',
  });
  const [prescriptionItems, setPrescriptionItems] = useState([{ ...emptyPrescriptionItem }]);
  const [batchForm, setBatchForm] = useState({
    medicationId: '',
    lotNumber: '',
    quantity: '1',
    unitCost: '',
    expiresAt: '',
    supplierName: '',
  });
  const [inventoryForm, setInventoryForm] = useState({ medicationId: '', countedQuantity: '0' });
  const [specialtyForm, setSpecialtyForm] = useState({
    patientId: '',
    clinicalOrderId: '',
    specialty: 'SURGERY',
    title: '',
    diagnosis: '',
    scheduledAt: '',
    structuredData: '{}',
    checklist: '{}',
  });
  const [radiologyForm, setRadiologyForm] = useState({
    patientId: '',
    clinicalOrderId: '',
    modality: 'DX',
    bodyPart: '',
    indication: '',
    scheduledAt: '',
  });
  const [pacsForm, setPacsForm] = useState({
    name: 'PACS principal',
    baseUrl: '',
    dicomWebPath: '/dicom-web',
    viewerUrl: '',
    aeTitle: '',
    isActive: true,
  });
  const [shiftForm, setShiftForm] = useState({
    employeeId: '',
    service: '',
    location: '',
    startsAt: '',
    endsAt: '',
  });
  const [attendanceForm, setAttendanceForm] = useState({
    employeeId: '',
    date: '',
    status: 'PRESENT',
    minutesLate: '0',
  });
  const [payrollForm, setPayrollForm] = useState({
    label: '',
    startsOn: '',
    endsOn: '',
    employeeId: '',
    baseSalary: '',
    allowances: '0',
    overtime: '0',
    deductions: '0',
    taxes: '0',
  });
  const [accountForm, setAccountForm] = useState({ code: '', name: '', type: 'ASSET' });
  const [journalForm, setJournalForm] = useState({
    date: '',
    description: '',
    debitAccountId: '',
    creditAccountId: '',
    amount: '',
  });
  const [utilityForm, setUtilityForm] = useState({
    type: 'ELECTRICITY',
    periodStart: new Date().toISOString().slice(0, 7) + '-01',
    provider: '',
    reference: '',
    amount: '',
    dueAt: '',
    notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const data = await Promise.all([
      optional<{ items: Patient[] }>('/patients/lookup?limit=200', { items: [] }),
      optional<Medication[]>('/pharmacy/medications', []),
      optional<Policy[]>('/operations/insurance/policies', []),
      optional<Invoice[]>('/billing/invoices', []),
      optional<ClinicalOrder[]>('/operations/clinical-orders', []),
      optional<User[]>('/enterprise/hr/employees', []),
      optional<Coverage[]>('/enterprise/insurance/coverages', []),
      optional<Prescription[]>('/enterprise/prescriptions', []),
      optional<Batch[]>('/enterprise/pharmacy/batches', []),
      optional<Inventory[]>('/enterprise/pharmacy/inventories', []),
      optional<SpecialtyCase[]>('/enterprise/specialties', []),
      optional<RadiologyStudy[]>('/enterprise/radiology/studies', []),
      optional<Shift[]>('/enterprise/hr/shifts', []),
      optional<Attendance[]>('/enterprise/hr/attendance', []),
      optional<Payroll[]>('/enterprise/hr/payroll', []),
      optional<Account[]>('/enterprise/accounting/accounts', []),
      optional<Journal[]>('/enterprise/accounting/journal', []),
      optional<EnterpriseReport | null>('/enterprise/reports/summary', null),
      optional<typeof pacsForm | null>('/enterprise/radiology/pacs', null),
      optional<UtilityBill[]>('/enterprise/accounting/utilities', []),
    ]);
    setPatients(data[0].items);
    setMedications(data[1]);
    setPolicies(data[2]);
    setInvoices(data[3]);
    setOrders(data[4]);
    setEmployees(data[5]);
    setCoverages(data[6]);
    setPrescriptions(data[7]);
    setBatches(data[8]);
    setInventories(data[9]);
    setSpecialties(data[10]);
    setStudies(data[11]);
    setShifts(data[12]);
    setAttendance(data[13]);
    setPayroll(data[14]);
    setAccounts(data[15]);
    setJournal(data[16]);
    setReport(data[17]);
    if (data[18]) setPacsForm(data[18]);
    setUtilityBills(data[19]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (path: string, body: unknown, method = 'POST') => {
    setError('');
    setNotice('');
    try {
      const result = await resilientApi<{ queued?: boolean }>(path, {
        method,
        body: JSON.stringify(body),
      });
      setNotice(
        result?.queued
          ? 'Action conservée hors ligne. Elle sera synchronisée automatiquement.'
          : 'Opération enregistrée avec succès.',
      );
      if (!result?.queued) await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Opération impossible.');
      return false;
    }
  };

  const submitCoverage = async (event: FormEvent) => {
    event.preventDefault();
    if (await mutate('/enterprise/insurance/coverages', coverageForm)) {
      setCoverageForm({ invoiceId: '', patientInsuranceId: '', guaranteeReference: '' });
    }
  };
  const submitPrescription = async (event: FormEvent) => {
    event.preventDefault();
    const items = prescriptionItems.map((item) => ({
      ...item,
      durationDays: Number(item.durationDays),
      quantity: Number(item.quantity),
      instructions: item.instructions || undefined,
    }));
    if (await mutate('/enterprise/prescriptions', { ...prescriptionForm, items })) {
      setPrescriptionForm({
        patientId: '',
        diagnosis: '',
        generalInstructions: '',
        interactionOverrideReason: '',
      });
      setPrescriptionItems([{ ...emptyPrescriptionItem }]);
    }
  };
  const submitBatch = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/pharmacy/batches', {
      ...batchForm,
      quantity: Number(batchForm.quantity),
      unitCost: batchForm.unitCost ? Number(batchForm.unitCost) : undefined,
    });
  };
  const submitInventory = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/pharmacy/inventories', {
      lines: [
        {
          medicationId: inventoryForm.medicationId,
          countedQuantity: Number(inventoryForm.countedQuantity),
        },
      ],
    });
  };
  const submitSpecialty = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutate('/enterprise/specialties', {
        ...specialtyForm,
        scheduledAt: specialtyForm.scheduledAt || undefined,
        structuredData: JSON.parse(specialtyForm.structuredData),
        checklist: JSON.parse(specialtyForm.checklist),
      });
    } catch {
      setError('Les données structurées et la checklist doivent être du JSON valide.');
    }
  };
  const submitRadiology = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/radiology/studies', {
      ...radiologyForm,
      scheduledAt: radiologyForm.scheduledAt || undefined,
    });
  };
  const submitShift = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/hr/shifts', shiftForm);
  };
  const submitAttendance = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/hr/attendance', {
      ...attendanceForm,
      minutesLate: Number(attendanceForm.minutesLate),
    });
  };
  const submitPayroll = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/hr/payroll', {
      label: payrollForm.label,
      startsOn: payrollForm.startsOn,
      endsOn: payrollForm.endsOn,
      entries: [
        {
          employeeId: payrollForm.employeeId,
          baseSalary: Number(payrollForm.baseSalary),
          allowances: Number(payrollForm.allowances),
          overtime: Number(payrollForm.overtime),
          deductions: Number(payrollForm.deductions),
          taxes: Number(payrollForm.taxes),
        },
      ],
    });
  };
  const submitAccount = async (event: FormEvent) => {
    event.preventDefault();
    await mutate('/enterprise/accounting/accounts', accountForm);
  };
  const submitJournal = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(journalForm.amount);
    await mutate('/enterprise/accounting/journal', {
      date: journalForm.date,
      description: journalForm.description,
      lines: [
        { accountId: journalForm.debitAccountId, debit: amount, credit: 0 },
        { accountId: journalForm.creditAccountId, debit: 0, credit: amount },
      ],
    });
  };
  const submitUtility = async (event: FormEvent) => {
    event.preventDefault();
    if (
      await mutate('/enterprise/accounting/utilities', {
        ...utilityForm,
        amount: Number(utilityForm.amount),
        reference: utilityForm.reference || undefined,
        dueAt: utilityForm.dueAt || undefined,
        notes: utilityForm.notes || undefined,
      })
    ) {
      setUtilityForm({
        ...utilityForm,
        provider: '',
        reference: '',
        amount: '',
        dueAt: '',
        notes: '',
      });
    }
  };
  const visibleSections = sections.filter((item) => hasAnyRole(user, item.roles));
  const sectionVisible = visibleSections.some((item) => item.id === section);

  useEffect(() => {
    if (!sectionVisible && visibleSections[0]) setSection(visibleSections[0].id);
  }, [sectionVisible, user, visibleSections]);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pilotage avancé</span>
          <h1>Gestion hospitalière intégrée</h1>
          <p>Soins, assurance, pharmacie, imagerie, personnel et finances dans un même circuit.</p>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="admin-tabs enterprise-tabs">
        {visibleSections.map(({ id, label, icon: Icon }) => (
          <button
            className={section === id ? 'active' : ''}
            key={id}
            onClick={() => setSection(id)}
          >
            <Icon size={17} /> {label}
          </button>
        ))}
      </div>
      {loading && (
        <section className="panel empty-state">
          <Activity className="spin" /> Chargement des modules intégrés…
        </section>
      )}
      {!loading && visibleSections.length === 0 && (
        <section className="panel restricted">
          <ShieldCheck size={36} />
          <h2>Aucun module attribué</h2>
          <p>Les modules affichés dépendent strictement des rôles confiés à votre compte.</p>
        </section>
      )}
      {!loading && sectionVisible && section === 'insurance' && (
        <InsuranceSection
          coverages={coverages}
          invoices={invoices}
          policies={policies}
          form={coverageForm}
          setForm={setCoverageForm}
          onSubmit={submitCoverage}
          mutate={mutate}
        />
      )}
      {!loading && sectionVisible && section === 'prescriptions' && (
        <PrescriptionSection
          patients={patients}
          medications={medications}
          rows={prescriptions}
          form={prescriptionForm}
          setForm={setPrescriptionForm}
          items={prescriptionItems}
          setItems={setPrescriptionItems}
          onSubmit={submitPrescription}
          mutate={mutate}
          canCreate={hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON'])}
          canDispense={hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'PHARMACIST'])}
        />
      )}
      {!loading && sectionVisible && section === 'pharmacy' && (
        <PharmacySection
          medications={medications}
          batches={batches}
          inventories={inventories}
          batchForm={batchForm}
          setBatchForm={setBatchForm}
          inventoryForm={inventoryForm}
          setInventoryForm={setInventoryForm}
          submitBatch={submitBatch}
          submitInventory={submitInventory}
        />
      )}
      {!loading && sectionVisible && section === 'specialties' && (
        <SpecialtySection
          patients={patients}
          orders={orders}
          rows={specialties}
          form={specialtyForm}
          setForm={setSpecialtyForm}
          onSubmit={submitSpecialty}
          mutate={mutate}
        />
      )}
      {!loading && sectionVisible && section === 'radiology' && (
        <RadiologySection
          patients={patients}
          orders={orders}
          rows={studies}
          form={radiologyForm}
          setForm={setRadiologyForm}
          pacs={pacsForm}
          setPacs={setPacsForm}
          onSubmit={submitRadiology}
          mutate={mutate}
          canConfigurePacs={hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN'])}
          canRegisterDicom={hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'RADIOLOGIST'])}
        />
      )}
      {!loading && sectionVisible && section === 'hr' && (
        <HrSection
          employees={employees}
          shifts={shifts}
          attendance={attendance}
          payroll={payroll}
          shiftForm={shiftForm}
          setShiftForm={setShiftForm}
          attendanceForm={attendanceForm}
          setAttendanceForm={setAttendanceForm}
          payrollForm={payrollForm}
          setPayrollForm={setPayrollForm}
          submitShift={submitShift}
          submitAttendance={submitAttendance}
          submitPayroll={submitPayroll}
          mutate={mutate}
        />
      )}
      {!loading && sectionVisible && section === 'accounting' && (
        <AccountingSection
          accounts={accounts}
          journal={journal}
          utilityBills={utilityBills}
          report={report}
          accountForm={accountForm}
          setAccountForm={setAccountForm}
          journalForm={journalForm}
          setJournalForm={setJournalForm}
          submitAccount={submitAccount}
          submitJournal={submitJournal}
          utilityForm={utilityForm}
          setUtilityForm={setUtilityForm}
          submitUtility={submitUtility}
          mutate={mutate}
        />
      )}
    </>
  );
}

type Mutate = (path: string, body: unknown, method?: string) => Promise<boolean>;

function InsuranceSection(props: {
  coverages: Coverage[];
  invoices: Invoice[];
  policies: Policy[];
  form: typeof initialCoverage;
  setForm: (value: typeof initialCoverage) => void;
  onSubmit: (event: FormEvent) => void;
  mutate: Mutate;
}) {
  const { coverages, invoices, policies, form, setForm, onSubmit, mutate } = props;
  return (
    <div className="enterprise-stack">
      <details className="panel enterprise-form" open>
        <summary>
          <Plus size={17} /> Répartir une facture entre patient et assureur
        </summary>
        <form onSubmit={onSubmit} className="form-grid">
          <SelectField
            label="Facture"
            value={form.invoiceId}
            onChange={(invoiceId) => setForm({ ...form, invoiceId })}
            options={invoices.map((item) => ({
              value: item.id,
              label: `${item.number} — ${patientName(item.patient)} — ${currency(item.total)}`,
            }))}
          />
          <SelectField
            label="Police d'assurance"
            value={form.patientInsuranceId}
            onChange={(patientInsuranceId) => setForm({ ...form, patientInsuranceId })}
            options={policies.map((item) => ({
              value: item.id,
              label: `${item.provider.name} · ${item.memberNumber} · ${item.coveragePercent}%`,
            }))}
          />
          <InputField
            label="Référence de garantie"
            value={form.guaranteeReference}
            onChange={(guaranteeReference) => setForm({ ...form, guaranteeReference })}
          />
          <div className="modal-actions full">
            <button className="primary-button">Calculer et enregistrer</button>
          </div>
        </form>
      </details>
      <DataTable
        headers={['Facture', 'Patient / assureur', 'Répartition', 'Statut', 'Actions']}
        empty="Aucune prise en charge répartie."
      >
        {coverages.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.invoice.number}</strong>
            </td>
            <td>
              {patientName(row.invoice.patient)}
              <br />
              <span className="muted">{row.patientInsurance.provider.name}</span>
            </td>
            <td>
              Patient {currency(row.patientAmount)}
              <br />
              Assureur {currency(row.insurerAmount)}
            </td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                {row.status === 'DRAFT' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void mutate(
                        `/enterprise/insurance/coverages/${row.id}`,
                        {
                          status: 'GUARANTEED',
                          guaranteeReference: row.guaranteeReference ?? `GAR-${Date.now()}`,
                        },
                        'PATCH',
                      )
                    }
                  >
                    Garantir
                  </button>
                )}
                {row.status === 'GUARANTEED' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void mutate(
                        `/enterprise/insurance/coverages/${row.id}`,
                        { status: 'SETTLED' },
                        'PATCH',
                      )
                    }
                  >
                    Solder
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=coverage&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="INVOICE" entityId={row.invoice.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
const initialCoverage = { invoiceId: '', patientInsuranceId: '', guaranteeReference: '' };

function PrescriptionSection(props: {
  patients: Patient[];
  medications: Medication[];
  rows: Prescription[];
  form: {
    patientId: string;
    diagnosis: string;
    generalInstructions: string;
    interactionOverrideReason: string;
  };
  setForm: (value: {
    patientId: string;
    diagnosis: string;
    generalInstructions: string;
    interactionOverrideReason: string;
  }) => void;
  items: Array<typeof emptyPrescriptionItem>;
  setItems: (value: Array<typeof emptyPrescriptionItem>) => void;
  onSubmit: (event: FormEvent) => void;
  mutate: Mutate;
  canCreate: boolean;
  canDispense: boolean;
}) {
  const { patients, medications, rows, form, setForm, items, setItems, onSubmit, mutate } = props;
  const updateItem = (index: number, key: keyof typeof emptyPrescriptionItem, value: string) =>
    setItems(items.map((item, current) => (current === index ? { ...item, [key]: value } : item)));
  return (
    <div className="enterprise-stack">
      {props.canCreate && (
        <details className="panel enterprise-form">
          <summary>
            <Stethoscope size={17} /> Nouvelle prescription structurée
          </summary>
          <form onSubmit={onSubmit}>
            <div className="form-grid">
              <SelectField
                label="Patient"
                value={form.patientId}
                onChange={(patientId) => setForm({ ...form, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: `${patientName(patient)} — ${patient.medicalRecordNumber}`,
                }))}
              />
              <InputField
                label="Diagnostic"
                value={form.diagnosis}
                onChange={(diagnosis) => setForm({ ...form, diagnosis })}
              />
              <InputField
                label="Instructions générales"
                value={form.generalInstructions}
                onChange={(generalInstructions) => setForm({ ...form, generalInstructions })}
              />
              <InputField
                label="Motif si interaction contre-indiquée"
                value={form.interactionOverrideReason}
                onChange={(interactionOverrideReason) =>
                  setForm({ ...form, interactionOverrideReason })
                }
              />
            </div>
            <div className="invoice-items">
              {items.map((item, index) => (
                <div className="prescription-item-grid" key={index}>
                  <select
                    required
                    value={item.medicationId}
                    onChange={(event) => updateItem(index, 'medicationId', event.target.value)}
                  >
                    <option value="">Médicament</option>
                    {medications.map((medication) => (
                      <option value={medication.id} key={medication.id}>
                        {medication.name} {medication.strength} — stock {medication.stockQuantity} —{' '}
                        {currency(medication.unitPrice)}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Dosage"
                    value={item.dosage}
                    onChange={(event) => updateItem(index, 'dosage', event.target.value)}
                  />
                  <input
                    required
                    placeholder="Fréquence"
                    value={item.frequency}
                    onChange={(event) => updateItem(index, 'frequency', event.target.value)}
                  />
                  <input
                    required
                    placeholder="Voie"
                    value={item.route}
                    onChange={(event) => updateItem(index, 'route', event.target.value)}
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Jours"
                    value={item.durationDays}
                    onChange={(event) => updateItem(index, 'durationDays', event.target.value)}
                  />
                  <input
                    required
                    type="number"
                    min="1"
                    placeholder="Quantité"
                    value={item.quantity}
                    onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setItems([...items, { ...emptyPrescriptionItem }])}
              >
                <Plus size={15} /> Médicament
              </button>
              <button className="primary-button">Prescrire et facturer</button>
            </div>
          </form>
        </details>
      )}
      <DataTable
        headers={['Ordonnance', 'Patient', 'Traitement', 'Facture', 'Statut', 'Actions']}
        empty="Aucune ordonnance."
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.number}</strong>
              <br />
              <span className="muted">
                {new Date(row.prescribedAt).toLocaleDateString('fr-FR')}
              </span>
            </td>
            <td>{patientName(row.patient)}</td>
            <td>
              {row.items.map((item) => (
                <div key={item.id}>
                  {item.medicationName || item.medication?.name || 'Médicament'}{item.availability !== 'INTERNAL' ? ' · achat extérieur' : ''} — {item.dosage}, {item.frequency}, {item.durationDays} j
                </div>
              ))}
            </td>
            <td>
              {row.invoice.number}
              <br />
              <StatusBadge status={row.invoice.status} />
            </td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                {props.canDispense && row.status === 'ACTIVE' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void mutate(`/enterprise/prescriptions/${row.id}/dispense`, {}, 'POST')
                    }
                  >
                    Délivrer
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=prescription&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="PRESCRIPTION" entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function PharmacySection(props: {
  medications: Medication[];
  batches: Batch[];
  inventories: Inventory[];
  batchForm: {
    medicationId: string;
    lotNumber: string;
    quantity: string;
    unitCost: string;
    expiresAt: string;
    supplierName: string;
  };
  setBatchForm: (value: {
    medicationId: string;
    lotNumber: string;
    quantity: string;
    unitCost: string;
    expiresAt: string;
    supplierName: string;
  }) => void;
  inventoryForm: { medicationId: string; countedQuantity: string };
  setInventoryForm: (value: { medicationId: string; countedQuantity: string }) => void;
  submitBatch: (event: FormEvent) => void;
  submitInventory: (event: FormEvent) => void;
}) {
  const p = props;
  const medOptions = p.medications.map((item) => ({
    value: item.id,
    label: `${item.name} — stock ${item.stockQuantity}`,
  }));
  return (
    <div className="enterprise-stack">
      <div className="enterprise-two-columns">
        <details className="panel enterprise-form">
          <summary>
            <Boxes size={17} /> Réceptionner un lot
          </summary>
          <form onSubmit={p.submitBatch} className="form-grid">
            <SelectField
              label="Médicament"
              value={p.batchForm.medicationId}
              onChange={(medicationId) => p.setBatchForm({ ...p.batchForm, medicationId })}
              options={medOptions}
            />
            <InputField
              label="Numéro de lot"
              value={p.batchForm.lotNumber}
              onChange={(lotNumber) => p.setBatchForm({ ...p.batchForm, lotNumber })}
            />
            <InputField
              label="Quantité"
              type="number"
              value={p.batchForm.quantity}
              onChange={(quantity) => p.setBatchForm({ ...p.batchForm, quantity })}
            />
            <InputField
              label="Coût unitaire"
              type="number"
              value={p.batchForm.unitCost}
              onChange={(unitCost) => p.setBatchForm({ ...p.batchForm, unitCost })}
            />
            <InputField
              label="Expiration"
              type="date"
              value={p.batchForm.expiresAt}
              onChange={(expiresAt) => p.setBatchForm({ ...p.batchForm, expiresAt })}
            />
            <InputField
              label="Fournisseur"
              value={p.batchForm.supplierName}
              onChange={(supplierName) => p.setBatchForm({ ...p.batchForm, supplierName })}
            />
            <div className="modal-actions full">
              <button className="primary-button">Réceptionner</button>
            </div>
          </form>
        </details>
        <details className="panel enterprise-form">
          <summary>
            <ReceiptText size={17} /> Inventaire physique
          </summary>
          <form onSubmit={p.submitInventory} className="form-grid">
            <SelectField
              label="Médicament"
              value={p.inventoryForm.medicationId}
              onChange={(medicationId) => p.setInventoryForm({ ...p.inventoryForm, medicationId })}
              options={medOptions}
            />
            <InputField
              label="Quantité comptée"
              type="number"
              value={p.inventoryForm.countedQuantity}
              onChange={(countedQuantity) =>
                p.setInventoryForm({ ...p.inventoryForm, countedQuantity })
              }
            />
            <div className="modal-actions full">
              <button className="primary-button">Rapprocher le stock</button>
            </div>
          </form>
        </details>
      </div>
      <DataTable
        headers={['Médicament', 'Lot', 'Quantité', 'Expiration', 'État', 'Rubriques']}
        empty="Aucun lot."
      >
        {p.batches.map((row) => (
          <tr key={row.id}>
            <td>{row.medication.name}</td>
            <td>
              <strong>{row.lotNumber}</strong>
            </td>
            <td>{row.quantity}</td>
            <td>{new Date(row.expiresAt).toLocaleDateString('fr-FR')}</td>
            <td>
              <StatusBadge status={row.isQuarantined ? 'QUARANTAINE' : 'VALIDE'} />
            </td>
            <td>
              <CustomFieldsEditor entity="PHARMACY_BATCH" entityId={row.id} />
            </td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        headers={['Référence', 'Date', 'Lignes', 'Écarts', 'Statut', 'Actions']}
        empty="Aucun inventaire physique."
      >
        {p.inventories.map((inventory) => (
          <tr key={inventory.id}>
            <td>
              <strong>{inventory.reference}</strong>
            </td>
            <td>{new Date(inventory.startedAt).toLocaleDateString('fr-FR')}</td>
            <td>{inventory.lines.length}</td>
            <td>{inventory.lines.reduce((sum, line) => sum + Math.abs(line.difference), 0)}</td>
            <td>
              <StatusBadge status={inventory.status} />
            </td>
            <td>
              <Link
                className="text-button"
                target="_blank"
                href={`/print?kind=inventory&id=${inventory.id}`}
              >
                Imprimer
              </Link>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}

function SpecialtySection(props: {
  patients: Patient[];
  orders: ClinicalOrder[];
  rows: SpecialtyCase[];
  form: typeof initialSpecialty;
  setForm: (value: typeof initialSpecialty) => void;
  onSubmit: (event: FormEvent) => void;
  mutate: Mutate;
}) {
  const p = props;
  const complete = (row: SpecialtyCase) => {
    const report = window.prompt('Compte rendu obligatoire :');
    if (report)
      void p.mutate(`/enterprise/specialties/${row.id}`, { status: 'COMPLETED', report }, 'PATCH');
  };
  return (
    <div className="enterprise-stack">
      <details className="panel enterprise-form">
        <summary>
          <FileHeart size={17} /> Ouvrir un dossier spécialisé
        </summary>
        <form onSubmit={p.onSubmit} className="form-grid">
          <SelectField
            label="Spécialité"
            value={p.form.specialty}
            onChange={(specialty) => p.setForm({ ...p.form, specialty })}
            options={['SURGERY', 'MATERNITY', 'PEDIATRICS'].map((value) => ({
              value,
              label: value,
            }))}
          />
          <SelectField
            label="Patient"
            value={p.form.patientId}
            onChange={(patientId) => p.setForm({ ...p.form, patientId })}
            options={p.patients.map((patient) => ({
              value: patient.id,
              label: patientName(patient),
            }))}
          />
          <SelectField
            label="Acte tarifé et payé"
            value={p.form.clinicalOrderId}
            onChange={(clinicalOrderId) => p.setForm({ ...p.form, clinicalOrderId })}
            options={p.orders
              .filter((order) => order.type === p.form.specialty)
              .map((order) => ({
                value: order.id,
                label: `${order.service.name} — ${patientName(order.patient)}`,
              }))}
          />
          <InputField
            label="Titre"
            value={p.form.title}
            onChange={(title) => p.setForm({ ...p.form, title })}
          />
          <InputField
            label="Diagnostic"
            value={p.form.diagnosis}
            onChange={(diagnosis) => p.setForm({ ...p.form, diagnosis })}
          />
          <InputField
            label="Planification"
            type="datetime-local"
            value={p.form.scheduledAt}
            onChange={(scheduledAt) => p.setForm({ ...p.form, scheduledAt })}
          />
          <InputField
            label="Données structurées (JSON)"
            value={p.form.structuredData}
            onChange={(structuredData) => p.setForm({ ...p.form, structuredData })}
          />
          <InputField
            label="Checklist (JSON)"
            value={p.form.checklist}
            onChange={(checklist) => p.setForm({ ...p.form, checklist })}
          />
          <div className="modal-actions full">
            <button className="primary-button">Créer le dossier</button>
          </div>
        </form>
      </details>
      <DataTable
        headers={['Spécialité', 'Patient', 'Dossier', 'Statut', 'Actions']}
        empty="Aucun dossier spécialisé."
      >
        {p.rows.map((row) => (
          <tr key={row.id}>
            <td>{row.specialty}</td>
            <td>{patientName(row.patient)}</td>
            <td>
              <strong>{row.title}</strong>
            </td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                {row.status === 'OPEN' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void p.mutate(
                        `/enterprise/specialties/${row.id}`,
                        { status: 'IN_PROGRESS' },
                        'PATCH',
                      )
                    }
                  >
                    Démarrer
                  </button>
                )}
                {row.status === 'IN_PROGRESS' && (
                  <button className="text-button" onClick={() => complete(row)}>
                    Terminer
                  </button>
                )}
                {row.status === 'COMPLETED' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void p.mutate(
                        `/enterprise/specialties/${row.id}`,
                        { status: 'VALIDATED' },
                        'PATCH',
                      )
                    }
                  >
                    Valider
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=specialty&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity={row.specialty} entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
const initialSpecialty = {
  patientId: '',
  clinicalOrderId: '',
  specialty: 'SURGERY',
  title: '',
  diagnosis: '',
  scheduledAt: '',
  structuredData: '{}',
  checklist: '{}',
};

function RadiologySection(props: {
  patients: Patient[];
  orders: ClinicalOrder[];
  rows: RadiologyStudy[];
  form: typeof initialRadiology;
  setForm: (value: typeof initialRadiology) => void;
  pacs: typeof initialPacs;
  setPacs: (value: typeof initialPacs) => void;
  onSubmit: (event: FormEvent) => void;
  mutate: Mutate;
  canConfigurePacs: boolean;
  canRegisterDicom: boolean;
}) {
  const p = props;
  const acquire = (row: RadiologyStudy) => {
    const studyInstanceUid = window.prompt('Study Instance UID DICOM :');
    if (studyInstanceUid)
      void p.mutate(
        `/enterprise/radiology/studies/${row.id}`,
        { status: 'ACQUIRED', studyInstanceUid },
        'PATCH',
      );
  };
  const reportStudy = (row: RadiologyStudy) => {
    const report = window.prompt('Compte rendu radiologique :');
    if (report)
      void p.mutate(
        `/enterprise/radiology/studies/${row.id}`,
        { status: 'REPORTED', report },
        'PATCH',
      );
  };
  const registerInstance = (row: RadiologyStudy) => {
    const seriesInstanceUid = window.prompt('Series Instance UID :');
    const sopInstanceUid = window.prompt('SOP Instance UID :');
    if (seriesInstanceUid && sopInstanceUid)
      void p.mutate(
        `/enterprise/radiology/studies/${row.id}/instances`,
        { seriesInstanceUid, sopInstanceUid },
        'POST',
      );
  };
  return (
    <div className="enterprise-stack">
      <div className="enterprise-two-columns">
        <details className="panel enterprise-form">
          <summary>
            <ImageIcon size={17} /> Nouvelle étude
          </summary>
          <form onSubmit={p.onSubmit} className="form-grid">
            <SelectField
              label="Patient"
              value={p.form.patientId}
              onChange={(patientId) => p.setForm({ ...p.form, patientId })}
              options={p.patients.map((patient) => ({
                value: patient.id,
                label: patientName(patient),
              }))}
            />
            <SelectField
              label="Acte radiologie payé"
              value={p.form.clinicalOrderId}
              onChange={(clinicalOrderId) => p.setForm({ ...p.form, clinicalOrderId })}
              options={p.orders
                .filter((order) => order.type === 'RADIOLOGY')
                .map((order) => ({
                  value: order.id,
                  label: `${order.service.name} — ${patientName(order.patient)}`,
                }))}
            />
            <SelectField
              label="Modalité"
              value={p.form.modality}
              onChange={(modality) => p.setForm({ ...p.form, modality })}
              options={['CR', 'DX', 'US', 'CT', 'MR', 'MG', 'XA', 'OTHER'].map((value) => ({
                value,
                label: value,
              }))}
            />
            <InputField
              label="Région anatomique"
              value={p.form.bodyPart}
              onChange={(bodyPart) => p.setForm({ ...p.form, bodyPart })}
            />
            <InputField
              label="Indication"
              value={p.form.indication}
              onChange={(indication) => p.setForm({ ...p.form, indication })}
            />
            <InputField
              label="Planification"
              type="datetime-local"
              value={p.form.scheduledAt}
              onChange={(scheduledAt) => p.setForm({ ...p.form, scheduledAt })}
            />
            <div className="modal-actions full">
              <button className="primary-button">Créer l&apos;étude</button>
            </div>
          </form>
        </details>
        {p.canConfigurePacs && (
          <details className="panel enterprise-form">
            <summary>
              <CalendarClock size={17} /> Connexion PACS / DICOMweb
            </summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void p.mutate('/enterprise/radiology/pacs', p.pacs, 'PATCH');
              }}
              className="form-grid"
            >
              <InputField
                label="Nom"
                value={p.pacs.name}
                onChange={(name) => p.setPacs({ ...p.pacs, name })}
              />
              <InputField
                label="URL PACS"
                type="url"
                value={p.pacs.baseUrl}
                onChange={(baseUrl) => p.setPacs({ ...p.pacs, baseUrl })}
              />
              <InputField
                label="Chemin DICOMweb"
                value={p.pacs.dicomWebPath}
                onChange={(dicomWebPath) => p.setPacs({ ...p.pacs, dicomWebPath })}
              />
              <InputField
                label="URL viewer"
                type="url"
                value={p.pacs.viewerUrl}
                onChange={(viewerUrl) => p.setPacs({ ...p.pacs, viewerUrl })}
              />
              <InputField
                label="AE Title"
                value={p.pacs.aeTitle}
                onChange={(aeTitle) => p.setPacs({ ...p.pacs, aeTitle })}
              />
              <div className="modal-actions full">
                <button className="primary-button">Enregistrer PACS</button>
              </div>
            </form>
          </details>
        )}
      </div>
      <DataTable
        headers={['Accession', 'Patient', 'Modalité / région', 'DICOM', 'Statut', 'Actions']}
        empty="Aucune étude radiologique."
      >
        {p.rows.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.accessionNumber}</strong>
            </td>
            <td>{patientName(row.patient)}</td>
            <td>
              {row.modality} · {row.bodyPart}
            </td>
            <td>{row.instances.length} instance(s)</td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                {row.pacsViewerUrl && (
                  <a
                    className="text-button"
                    target="_blank"
                    rel="noreferrer"
                    href={row.pacsViewerUrl}
                  >
                    Viewer
                  </a>
                )}
                {['ORDERED', 'SCHEDULED'].includes(row.status) && (
                  <button className="text-button" onClick={() => acquire(row)}>
                    Acquérir
                  </button>
                )}
                {row.status === 'ACQUIRED' && (
                  <button className="text-button" onClick={() => reportStudy(row)}>
                    Compte rendu
                  </button>
                )}
                {row.status === 'REPORTED' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void p.mutate(
                        `/enterprise/radiology/studies/${row.id}`,
                        { status: 'VALIDATED' },
                        'PATCH',
                      )
                    }
                  >
                    Valider
                  </button>
                )}
                {p.canRegisterDicom && (
                  <button className="text-button" onClick={() => registerInstance(row)}>
                    + DICOM
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=radiology&id=${row.id}`}
                >
                  Compte rendu
                </Link>
                <CustomFieldsEditor entity="RADIOLOGY" entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
const initialRadiology = {
  patientId: '',
  clinicalOrderId: '',
  modality: 'DX',
  bodyPart: '',
  indication: '',
  scheduledAt: '',
};
const initialPacs = {
  name: 'PACS principal',
  baseUrl: '',
  dicomWebPath: '/dicom-web',
  viewerUrl: '',
  aeTitle: '',
  isActive: true,
};

function HrSection(props: {
  employees: User[];
  shifts: Shift[];
  attendance: Attendance[];
  payroll: Payroll[];
  shiftForm: typeof initialShift;
  setShiftForm: (value: typeof initialShift) => void;
  attendanceForm: typeof initialAttendance;
  setAttendanceForm: (value: typeof initialAttendance) => void;
  payrollForm: typeof initialPayroll;
  setPayrollForm: (value: typeof initialPayroll) => void;
  submitShift: (event: FormEvent) => void;
  submitAttendance: (event: FormEvent) => void;
  submitPayroll: (event: FormEvent) => void;
  mutate: Mutate;
}) {
  const p = props;
  const employeeOptions = p.employees.map((employee) => ({
    value: employee.id,
    label: `${employee.username} — ${employee.role}`,
  }));
  return (
    <div className="enterprise-stack">
      <div className="enterprise-three-columns">
        <details className="panel enterprise-form">
          <summary>Planifier une garde</summary>
          <form onSubmit={p.submitShift} className="form-grid one-column">
            <SelectField
              label="Employé"
              value={p.shiftForm.employeeId}
              onChange={(employeeId) => p.setShiftForm({ ...p.shiftForm, employeeId })}
              options={employeeOptions}
            />
            <InputField
              label="Service"
              value={p.shiftForm.service}
              onChange={(service) => p.setShiftForm({ ...p.shiftForm, service })}
            />
            <InputField
              label="Lieu"
              value={p.shiftForm.location}
              onChange={(location) => p.setShiftForm({ ...p.shiftForm, location })}
            />
            <InputField
              label="Début"
              type="datetime-local"
              value={p.shiftForm.startsAt}
              onChange={(startsAt) => p.setShiftForm({ ...p.shiftForm, startsAt })}
            />
            <InputField
              label="Fin"
              type="datetime-local"
              value={p.shiftForm.endsAt}
              onChange={(endsAt) => p.setShiftForm({ ...p.shiftForm, endsAt })}
            />
            <button className="primary-button">Planifier</button>
          </form>
        </details>
        <details className="panel enterprise-form">
          <summary>Pointer une présence</summary>
          <form onSubmit={p.submitAttendance} className="form-grid one-column">
            <SelectField
              label="Employé"
              value={p.attendanceForm.employeeId}
              onChange={(employeeId) => p.setAttendanceForm({ ...p.attendanceForm, employeeId })}
              options={employeeOptions}
            />
            <InputField
              label="Date"
              type="date"
              value={p.attendanceForm.date}
              onChange={(date) => p.setAttendanceForm({ ...p.attendanceForm, date })}
            />
            <SelectField
              label="Statut"
              value={p.attendanceForm.status}
              onChange={(status) => p.setAttendanceForm({ ...p.attendanceForm, status })}
              options={['PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'SICK'].map((value) => ({
                value,
                label: value,
              }))}
            />
            <InputField
              label="Retard (minutes)"
              type="number"
              value={p.attendanceForm.minutesLate}
              onChange={(minutesLate) => p.setAttendanceForm({ ...p.attendanceForm, minutesLate })}
            />
            <button className="primary-button">Enregistrer</button>
          </form>
        </details>
        <details className="panel enterprise-form">
          <summary>Calculer une paie</summary>
          <form onSubmit={p.submitPayroll} className="form-grid one-column">
            <InputField
              label="Libellé période"
              value={p.payrollForm.label}
              onChange={(label) => p.setPayrollForm({ ...p.payrollForm, label })}
            />
            <InputField
              label="Du"
              type="date"
              value={p.payrollForm.startsOn}
              onChange={(startsOn) => p.setPayrollForm({ ...p.payrollForm, startsOn })}
            />
            <InputField
              label="Au"
              type="date"
              value={p.payrollForm.endsOn}
              onChange={(endsOn) => p.setPayrollForm({ ...p.payrollForm, endsOn })}
            />
            <SelectField
              label="Employé"
              value={p.payrollForm.employeeId}
              onChange={(employeeId) => p.setPayrollForm({ ...p.payrollForm, employeeId })}
              options={employeeOptions}
            />
            <InputField
              label="Salaire de base"
              type="number"
              value={p.payrollForm.baseSalary}
              onChange={(baseSalary) => p.setPayrollForm({ ...p.payrollForm, baseSalary })}
            />
            <InputField
              label="Primes"
              type="number"
              value={p.payrollForm.allowances}
              onChange={(allowances) => p.setPayrollForm({ ...p.payrollForm, allowances })}
            />
            <InputField
              label="Retenues"
              type="number"
              value={p.payrollForm.deductions}
              onChange={(deductions) => p.setPayrollForm({ ...p.payrollForm, deductions })}
            />
            <InputField
              label="Heures supplémentaires"
              type="number"
              value={p.payrollForm.overtime}
              onChange={(overtime) => p.setPayrollForm({ ...p.payrollForm, overtime })}
            />
            <InputField
              label="Taxes"
              type="number"
              value={p.payrollForm.taxes}
              onChange={(taxes) => p.setPayrollForm({ ...p.payrollForm, taxes })}
            />
            <button className="primary-button">Calculer</button>
          </form>
        </details>
      </div>
      <DataTable
        headers={['Employé', 'Service', 'Début', 'Fin', 'Statut', 'Actions']}
        empty="Aucune garde."
      >
        {p.shifts.map((row) => (
          <tr key={row.id}>
            <td>{row.employee.username}</td>
            <td>{row.service}</td>
            <td>{new Date(row.startsAt).toLocaleString('fr-FR')}</td>
            <td>{new Date(row.endsAt).toLocaleString('fr-FR')}</td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=shift&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="SHIFT" entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        headers={['Date', 'Employé', 'Statut', 'Retard', 'Actions']}
        empty="Aucune présence."
      >
        {p.attendance.map((row) => (
          <tr key={row.id}>
            <td>{new Date(row.date).toLocaleDateString('fr-FR')}</td>
            <td>{row.employee.username}</td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>{row.minutesLate} min</td>
            <td>
              <div className="row-actions">
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=attendance&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="ATTENDANCE" entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        headers={['Période', 'Dates', 'Employés', 'Net', 'Statut', 'Actions']}
        empty="Aucune période de paie."
      >
        {p.payroll.map((period) => (
          <tr key={period.id}>
            <td>
              <strong>{period.label}</strong>
            </td>
            <td>
              {new Date(period.startsOn).toLocaleDateString('fr-FR')} —{' '}
              {new Date(period.endsOn).toLocaleDateString('fr-FR')}
            </td>
            <td>{period.entries.length}</td>
            <td>
              {currency(period.entries.reduce((sum, entry) => sum + Number(entry.netSalary), 0))}
            </td>
            <td>
              <StatusBadge status={period.status} />
            </td>
            <td>
              <div className="row-actions">
                {['CALCULATED', 'APPROVED'].includes(period.status) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void p.mutate(
                        `/enterprise/hr/payroll/${period.id}`,
                        { status: period.status === 'CALCULATED' ? 'APPROVED' : 'PAID' },
                        'PATCH',
                      )
                    }
                  >
                    {period.status === 'CALCULATED' ? 'Approuver' : 'Payer'}
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=payroll&id=${period.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="PAYROLL" entityId={period.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
const initialShift = { employeeId: '', service: '', location: '', startsAt: '', endsAt: '' };
const initialAttendance = { employeeId: '', date: '', status: 'PRESENT', minutesLate: '0' };
const initialPayroll = {
  label: '',
  startsOn: '',
  endsOn: '',
  employeeId: '',
  baseSalary: '',
  allowances: '0',
  overtime: '0',
  deductions: '0',
  taxes: '0',
};

function AccountingSection(props: {
  accounts: Account[];
  journal: Journal[];
  utilityBills: UtilityBill[];
  report: EnterpriseReport | null;
  accountForm: typeof initialAccount;
  setAccountForm: (value: typeof initialAccount) => void;
  journalForm: typeof initialJournal;
  setJournalForm: (value: typeof initialJournal) => void;
  submitAccount: (event: FormEvent) => void;
  submitJournal: (event: FormEvent) => void;
  utilityForm: typeof initialUtility;
  setUtilityForm: (value: typeof initialUtility) => void;
  submitUtility: (event: FormEvent) => void;
  mutate: Mutate;
}) {
  const p = props;
  const accountOptions = p.accounts.map((account) => ({
    value: account.id,
    label: `${account.code} — ${account.name}`,
  }));
  return (
    <div className="enterprise-stack">
      {p.report && (
        <div className="stats-grid report-grid">
          <Stat label="Prises en charge" value={p.report.insurance.count} />
          <Stat label="Ordonnances" value={p.report.prescriptions} />
          <Stat label="Lots expirés" value={p.report.expiredBatches} />
          <Stat label="Dossiers spécialisés" value={p.report.specialtyCases} />
          <Stat label="Études radiologiques" value={p.report.radiologyStudies} />
          <Stat label="Masse salariale" value={currency(p.report.payroll.netTotal)} />
        </div>
      )}
      <div className="enterprise-two-columns">
        <details className="panel enterprise-form">
          <summary>Créer un compte comptable</summary>
          <form onSubmit={p.submitAccount} className="form-grid">
            <InputField
              label="Code"
              value={p.accountForm.code}
              onChange={(code) => p.setAccountForm({ ...p.accountForm, code })}
            />
            <InputField
              label="Libellé"
              value={p.accountForm.name}
              onChange={(name) => p.setAccountForm({ ...p.accountForm, name })}
            />
            <SelectField
              label="Type"
              value={p.accountForm.type}
              onChange={(type) => p.setAccountForm({ ...p.accountForm, type })}
              options={['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((value) => ({
                value,
                label: value,
              }))}
            />
            <button className="primary-button">Créer</button>
          </form>
        </details>
        <details className="panel enterprise-form">
          <summary>Saisir une écriture équilibrée</summary>
          <form onSubmit={p.submitJournal} className="form-grid">
            <InputField
              label="Date"
              type="date"
              value={p.journalForm.date}
              onChange={(date) => p.setJournalForm({ ...p.journalForm, date })}
            />
            <InputField
              label="Libellé"
              value={p.journalForm.description}
              onChange={(description) => p.setJournalForm({ ...p.journalForm, description })}
            />
            <SelectField
              label="Compte débité"
              value={p.journalForm.debitAccountId}
              onChange={(debitAccountId) => p.setJournalForm({ ...p.journalForm, debitAccountId })}
              options={accountOptions}
            />
            <SelectField
              label="Compte crédité"
              value={p.journalForm.creditAccountId}
              onChange={(creditAccountId) =>
                p.setJournalForm({ ...p.journalForm, creditAccountId })
              }
              options={accountOptions}
            />
            <InputField
              label="Montant"
              type="number"
              value={p.journalForm.amount}
              onChange={(amount) => p.setJournalForm({ ...p.journalForm, amount })}
            />
            <button className="primary-button">Enregistrer</button>
          </form>
        </details>
      </div>
      <details className="panel enterprise-form" open>
        <summary>Charges mensuelles : courant, eau et Internet</summary>
        <form onSubmit={p.submitUtility} className="form-grid">
          <SelectField
            label="Charge"
            value={p.utilityForm.type}
            onChange={(type) => p.setUtilityForm({ ...p.utilityForm, type })}
            options={[
              { value: 'ELECTRICITY', label: 'Courant / électricité' },
              { value: 'WATER', label: 'Eau' },
              { value: 'INTERNET', label: 'Connexion Internet' },
            ]}
          />
          <InputField
            label="Mois"
            type="date"
            value={p.utilityForm.periodStart}
            onChange={(periodStart) => p.setUtilityForm({ ...p.utilityForm, periodStart })}
          />
          <InputField
            label="Fournisseur"
            value={p.utilityForm.provider}
            onChange={(provider) => p.setUtilityForm({ ...p.utilityForm, provider })}
          />
          <InputField
            label="Référence"
            value={p.utilityForm.reference}
            onChange={(reference) => p.setUtilityForm({ ...p.utilityForm, reference })}
          />
          <InputField
            label="Montant CDF"
            type="number"
            value={p.utilityForm.amount}
            onChange={(amount) => p.setUtilityForm({ ...p.utilityForm, amount })}
          />
          <InputField
            label="Échéance"
            type="date"
            value={p.utilityForm.dueAt}
            onChange={(dueAt) => p.setUtilityForm({ ...p.utilityForm, dueAt })}
          />
          <button className="primary-button">Ajouter la facture mensuelle</button>
        </form>
      </details>
      <DataTable
        headers={['Mois', 'Charge', 'Fournisseur', 'Montant', 'Statut', 'Action']}
        empty="Aucune charge mensuelle."
      >
        {p.utilityBills.map((bill) => (
          <tr key={bill.id}>
            <td>
              {new Date(bill.periodStart).toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric',
              })}
            </td>
            <td>
              {bill.type === 'ELECTRICITY' ? 'Courant' : bill.type === 'WATER' ? 'Eau' : 'Internet'}
            </td>
            <td>{bill.provider}</td>
            <td>{currency(bill.amount)}</td>
            <td>
              <StatusBadge status={bill.status} />
            </td>
            <td>
              {bill.status === 'PENDING' && (
                <button
                  className="text-button"
                  onClick={() =>
                    void p.mutate(
                      `/enterprise/accounting/utilities/${bill.id}`,
                      { status: 'PAID' },
                      'PATCH',
                    )
                  }
                >
                  Marquer payée
                </button>
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Exports réglementaires</span>
            <h2>PDF, Excel et CSV</h2>
          </div>
        </div>
        <div className="export-actions">
          {['patients', 'finance', 'pharmacy', 'hr', 'regulatory'].flatMap((report) =>
            ['pdf', 'xlsx', 'csv'].map((format) => (
              <a
                className="secondary-button"
                key={`${report}-${format}`}
                href={`${API_URL}/enterprise/exports/${report}?format=${format}`}
              >
                <Download size={16} /> {report} {format.toUpperCase()}
              </a>
            )),
          )}
        </div>
      </section>
      <DataTable
        headers={['Écriture', 'Date', 'Libellé', 'Débit', 'Crédit', 'Statut', 'Actions']}
        empty="Aucune écriture."
      >
        {p.journal.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.number}</strong>
            </td>
            <td>{new Date(row.date).toLocaleDateString('fr-FR')}</td>
            <td>{row.description}</td>
            <td>{currency(row.lines.reduce((sum, line) => sum + Number(line.debit), 0))}</td>
            <td>{currency(row.lines.reduce((sum, line) => sum + Number(line.credit), 0))}</td>
            <td>
              <StatusBadge status={row.status} />
            </td>
            <td>
              <div className="row-actions">
                {row.status === 'DRAFT' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void p.mutate(
                        `/enterprise/accounting/journal/${row.id}`,
                        { status: 'POSTED' },
                        'PATCH',
                      )
                    }
                  >
                    Comptabiliser
                  </button>
                )}
                <Link
                  className="text-button"
                  target="_blank"
                  href={`/print?kind=accounting&id=${row.id}`}
                >
                  Imprimer
                </Link>
                <CustomFieldsEditor entity="ACCOUNTING" entityId={row.id} />
              </div>
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
const initialAccount = { code: '', name: '', type: 'ASSET' };
const initialUtility = {
  type: 'ELECTRICITY',
  periodStart: '',
  provider: '',
  reference: '',
  amount: '',
  dueAt: '',
  notes: '',
};
const initialJournal = {
  date: '',
  description: '',
  debitAccountId: '',
  creditAccountId: '',
  amount: '',
};

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="field">
      <span>{label} *</span>
      <select required value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Sélectionner</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        required={['date', 'datetime-local'].includes(type)}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function DataTable({
  headers,
  empty,
  children,
}: {
  headers: string[];
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="panel table-panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hasChildren ? (
              children
            ) : (
              <tr>
                <td colSpan={headers.length}>
                  <div className="empty-state">{empty}</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
