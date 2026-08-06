'use client';

import { Activity, ArrowLeft, Printer } from 'lucide-react';
import NextImage from 'next/image';
import { useSearchParams } from 'next/navigation';
import { CSSProperties, Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { currency, patientName } from '@/lib/display';
import { Patient } from '@/lib/types';

interface HospitalProfile {
  name: string;
  legalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  registrationNumber?: string;
  currency: string;
  invoiceFooter?: string;
  logoDataUrl?: string | null;
  documentHeader?: string;
  documentAccentColor: string;
  documentPaperSize: string;
  documentOrientation: string;
  documentMarginMm: number;
}
interface PrintTemplate {
  title?: string;
  headerText?: string;
  footerText?: string;
  paperSize: string;
  orientation: string;
  marginMm: number;
  accentColor?: string;
  showLogo: boolean;
}
interface PrintContext {
  profile: HospitalProfile;
  template?: PrintTemplate | null;
}
interface Payment {
  id: string;
  amount: string;
  method: string;
  reference?: string;
  paidAt: string;
  receivedBy: { username: string };
  payerType?: string;
}
interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string;
  issuedAt: string;
  notes?: string;
  patient: Patient;
  issuedBy: { username: string };
  items: Array<{ description: string; quantity: number; unitPrice: string; total: string }>;
  payments: Payment[];
  insuranceCoverage?: {
    coveragePercent: string;
    patientAmount: string;
    insurerAmount: string;
    patientInsurance: { provider: { name: string } };
  };
  voucherCoverage?: {
    coveragePercent: string;
    patientAmount: string;
    sponsorAmount: string;
    reference?: string;
    careVoucher: { number: string; issuerName: string };
  };
}
interface GroupedFinancialDocument {
  patient: Patient;
  invoices: Invoice[];
  total: number;
  paid: number;
  balance: number;
  generatedAt: string;
}

interface CareVoucherDocument {
  number: string;
  issuerName: string;
  sponsorType: 'COMPANY' | 'INDIVIDUAL';
  ceilingAmount?: string;
  usedAmount: string;
  validFrom?: string;
  validUntil?: string;
  coverages: Array<{
    id: string;
    status: string;
    sponsorAmount: string;
    invoice: Invoice;
  }>;
}
interface Exam {
  id: string;
  type: string;
  status: string;
  observations?: string;
  result?: string;
  resultSchema?: Array<{ key: string; label: string; unit?: string; reference?: string }>;
  resultData?: {
    values?: Array<{ key: string; value: string; note?: string }>;
    conclusion?: string;
  };
  requestedAt: string;
  completedAt?: string;
  validatedAt?: string;
  patient: Patient;
  requestedByDoctor: { lastName: string; postName?: string; firstName?: string; specialty: string };
  validatedByLabTech?: { lastName: string; postName?: string; firstName?: string };
}
interface ClinicalOrder {
  id: string;
  type: string;
  status: string;
  priority: string;
  clinicalIndication: string;
  result?: string;
  notes?: string;
  createdAt: string;
  completedAt?: string;
  validatedAt?: string;
  patient: Patient;
  service: { name: string };
  requestedBy: { username: string };
  performedBy?: { username: string };
}
interface Transfusion {
  id: string;
  status: string;
  indication: string;
  crossmatchReference: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  reactionNotes?: string;
  patient: Patient;
  bloodUnit: {
    code: string;
    bloodType: string;
    component: string;
    volumeMl: number;
    donorReference?: string;
    collectedAt: string;
    expiresAt: string;
  };
  prescribedBy: { username: string };
  administeredBy?: { username: string };
  clinicalOrder: {
    careAuthorization?: {
      status: string;
      paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
    };
  };
}
interface PurchaseOrder {
  id: string;
  number: string;
  status: string;
  total: string;
  notes?: string;
  createdAt: string;
  orderedAt?: string;
  receivedAt?: string;
  supplier: { code: string; name: string; phone?: string; email?: string; address?: string };
  createdBy: { username: string };
  items: Array<{
    description: string;
    quantity: number;
    receivedQuantity: number;
    unitCost: string;
    total: string;
  }>;
}

interface Prescription {
  id: string;
  number: string;
  status: string;
  diagnosis?: string;
  generalInstructions?: string;
  prescribedAt: string;
  patient: Patient;
  prescribedBy: { username: string };
  items: Array<{
    dosage: string;
    frequency: string;
    route: string;
    durationDays: number;
    quantity: number;
    instructions?: string;
    medicationName: string;
    strength?: string;
    availability: string;
    medication?: { name: string; strength?: string } | null;
  }>;
}
interface SpecialtyCase {
  id: string;
  specialty: string;
  title: string;
  diagnosis?: string;
  status: string;
  report?: string;
  structuredData: Record<string, unknown>;
  patient: Patient;
  responsible: { username: string };
}
interface RadiologyStudy {
  id: string;
  accessionNumber: string;
  modality: string;
  bodyPart: string;
  indication: string;
  status: string;
  report?: string;
  studyInstanceUid?: string;
  patient: Patient;
  performedBy?: { username: string };
  instances: unknown[];
}
interface InsuranceCoverage {
  id: string;
  status: string;
  coveragePercent: string;
  grossAmount: string;
  patientAmount: string;
  insurerAmount: string;
  guaranteeReference?: string;
  notes?: string;
  createdAt: string;
  invoice: { number: string; patient: Patient; payments: Payment[] };
  patientInsurance: {
    memberNumber: string;
    provider: { name: string; code: string };
  };
  createdBy: { username: string };
}
interface Inventory {
  id: string;
  reference: string;
  status: string;
  notes?: string;
  startedAt: string;
  reconciledAt?: string;
  countedBy: { username: string };
  lines: Array<{
    expectedQuantity: number;
    countedQuantity: number;
    difference: number;
    medicationName: string;
    strength?: string;
    availability: string;
    medication?: { name: string; strength?: string } | null;
  }>;
}
interface Shift {
  id: string;
  service: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes?: string;
  employee: { username: string; role: string };
}
interface Attendance {
  id: string;
  date: string;
  status: string;
  clockIn?: string;
  clockOut?: string;
  minutesLate: number;
  notes?: string;
  employee: { username: string; role: string };
}
interface Payroll {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  status: string;
  entries: Array<{
    id: string;
    status: string;
    baseSalary: string;
    allowances: string;
    overtime: string;
    deductions: string;
    taxes: string;
    netSalary: string;
    employee: { username: string; role: string };
  }>;
}
interface JournalEntry {
  id: string;
  number: string;
  date: string;
  description: string;
  reference?: string;
  status: string;
  postedAt?: string;
  createdBy: { username: string };
  lines: Array<{
    description?: string;
    debit: string;
    credit: string;
    account: { code: string; name: string };
  }>;
}

interface PatientHistoryDocument {
  patient: Patient & Record<string, unknown>;
  entries: Array<{
    id: string;
    kind: string;
    date: string;
    title: string;
    description?: string;
    status?: string;
  }>;
  counts: Record<string, number>;
}

type PrintableDocument =
  | Invoice
  | GroupedFinancialDocument
  | CareVoucherDocument
  | Exam
  | ClinicalOrder
  | Transfusion
  | PurchaseOrder
  | Prescription
  | SpecialtyCase
  | RadiologyStudy
  | InsuranceCoverage
  | Inventory
  | Shift
  | Attendance
  | Payroll
  | JournalEntry
  | PatientHistoryDocument;

export default function PrintPage() {
  return (
    <Suspense
      fallback={
        <div className="panel empty-state">
          <Activity className="spin" /> Préparation du document…
        </div>
      }
    >
      <PrintDocument />
    </Suspense>
  );
}

function PrintDocument() {
  const params = useSearchParams();
  const kind = params.get('kind') ?? '';
  const id = params.get('id') ?? '';
  const paymentId = params.get('paymentId') ?? '';
  const ids = params.get('ids') ?? '';
  const [printContext, setPrintContext] = useState<PrintContext | null>(null);
  const [document, setDocument] = useState<PrintableDocument | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const endpoints: Record<string, string> = {
      invoice: `/billing/invoices/${id}`,
      receipt: `/billing/invoices/${id}`,
      lab: `/laboratory/exams/${id}`,
      clinical: `/operations/clinical-orders/${id}`,
      transfusion: `/operations/blood-bank/transfusions/${id}`,
      purchase: `/operations/procurement/orders/${id}`,
      patient: `/patients/${id}/history`,
      prescription: `/enterprise/prescriptions/${id}`,
      specialty: `/enterprise/specialties/${id}`,
      radiology: `/enterprise/radiology/studies/${id}`,
      coverage: `/enterprise/insurance/coverages/${id}`,
      inventory: `/enterprise/pharmacy/inventories/${id}`,
      shift: `/enterprise/hr/shifts/${id}`,
      attendance: `/enterprise/hr/attendance/${id}`,
      payroll: `/enterprise/hr/payroll/${id}`,
      accounting: `/enterprise/accounting/journal/${id}`,
      'care-voucher': `/billing/vouchers/${id}`,
      'grouped-invoice': `/billing/invoices/documents/grouped?ids=${encodeURIComponent(ids)}`,
      'grouped-receipt': `/billing/invoices/documents/grouped?ids=${encodeURIComponent(ids)}`,
    };
    const endpoint = endpoints[kind] ?? '';
    if (!endpoint) {
      setError('Type de document inconnu.');
      return;
    }
    void Promise.all([
      api<PrintContext>(
        `/configuration/print-context?kind=${encodeURIComponent(kind === 'grouped-invoice' ? 'invoice' : kind === 'grouped-receipt' ? 'receipt' : kind)}`,
      ),
      api<PrintableDocument>(endpoint),
    ])
      .then(([context, data]) => {
        setPrintContext(context);
        setDocument(data);
      })
      .catch((exception: unknown) =>
        setError(exception instanceof Error ? exception.message : 'Document indisponible.'),
      );
  }, [id, ids, kind]);

  if (error) return <section className="panel alert error">{error}</section>;
  if (!printContext || !document)
    return (
      <section className="panel empty-state">
        <Activity className="spin" /> Préparation du document…
      </section>
    );

  const titles: Record<string, string> = {
    invoice: 'FACTURE',
    receipt: 'REÇU DE PAIEMENT',
    lab: 'RÉSULTAT DE LABORATOIRE',
    clinical: 'COMPTE RENDU MÉDICAL',
    transfusion: 'FICHE DE TRANSFUSION',
    purchase: 'BON DE COMMANDE',
    patient: 'SYNTHÈSE DU DOSSIER PATIENT',
    prescription: 'ORDONNANCE MÉDICALE',
    specialty: 'DOSSIER SPÉCIALISÉ',
    radiology: "COMPTE RENDU D'IMAGERIE",
    coverage: 'ATTESTATION DE PRISE EN CHARGE',
    inventory: "PROCÈS-VERBAL D'INVENTAIRE",
    shift: 'FICHE DE GARDE',
    attendance: 'FICHE DE PRÉSENCE',
    payroll: 'ÉTAT DE PAIE',
    accounting: 'PIÈCE COMPTABLE',
    'care-voucher': 'FACTURE CONSOLIDÉE DU GARANT',
    'grouped-invoice': 'FACTURE RÉCAPITULATIVE',
    'grouped-receipt': 'REÇU RÉCAPITULATIF',
  };
  const { profile, template } = printContext;
  const title = template?.title || titles[kind] || 'DOCUMENT HOSPITALIER';
  const paperSize = template?.paperSize ?? profile.documentPaperSize ?? 'A4';
  const orientation = template?.orientation ?? profile.documentOrientation ?? 'PORTRAIT';
  const marginMm = template?.marginMm ?? profile.documentMarginMm ?? 12;
  const accentColor = template?.accentColor ?? profile.documentAccentColor ?? '#167757';
  const dimensions: Record<string, [number, number]> = {
    A4: [210, 297],
    A5: [148, 210],
    LETTER: [216, 279],
  };
  const [paperWidth, paperHeight] = dimensions[paperSize] ?? [210, 297];
  const landscape = orientation === 'LANDSCAPE';
  const documentStyle = {
    '--print-accent': accentColor,
    '--print-padding': `${marginMm}mm`,
    width: `min(${landscape ? paperHeight : paperWidth}mm, 100%)`,
    minHeight: `${landscape ? paperWidth : paperHeight}mm`,
  } as CSSProperties;

  return (
    <>
      <div className="print-toolbar no-print">
        <span className="print-preview-label">
          Aperçu final — vérifiez le document avant impression
        </span>
        <button className="secondary-button" onClick={() => window.close()}>
          <ArrowLeft size={17} /> Fermer
        </button>
        <button className="primary-button" onClick={() => window.print()}>
          <Printer size={17} /> Imprimer / PDF
        </button>
      </div>
      <style>{`@media print { @page { size: ${paperSize.toLowerCase()} ${orientation.toLowerCase()}; margin: ${marginMm}mm; } }`}</style>
      <article className="print-document" style={documentStyle}>
        <header className="print-header">
          {(template?.showLogo ?? true) &&
            (profile.logoDataUrl ? (
              <NextImage
                unoptimized
                className="print-logo-image"
                src={profile.logoDataUrl}
                alt={`Logo ${profile.name}`}
                width={88}
                height={88}
                priority
              />
            ) : (
              <div className="print-logo">CHI</div>
            ))}
          <div>
            <h1>{profile.name}</h1>
            {profile.legalName && <p>{profile.legalName}</p>}
            <p>{[profile.address, profile.phone, profile.email].filter(Boolean).join(' · ')}</p>
            {profile.registrationNumber && <p>N° {profile.registrationNumber}</p>}
          </div>
        </header>
        {(template?.headerText || profile.documentHeader) && (
          <p className="print-header-note">{template?.headerText || profile.documentHeader}</p>
        )}
        <div className="print-title">
          <h2>{title}</h2>
          <span>
            Émis le{' '}
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(
              new Date(),
            )}
          </span>
        </div>
        {(kind === 'invoice' || kind === 'receipt') && (
          <FinancialDocument invoice={document as Invoice} kind={kind} paymentId={paymentId} />
        )}
        {(kind === 'grouped-invoice' || kind === 'grouped-receipt') && (
          <GroupedFinancialDocumentView
            document={document as GroupedFinancialDocument}
            kind={kind}
          />
        )}
        {kind === 'lab' && <LabDocument exam={document as Exam} />}
        {kind === 'clinical' && <ClinicalDocument order={document as ClinicalOrder} />}
        {kind === 'transfusion' && <TransfusionDocument transfusion={document as Transfusion} />}
        {kind === 'purchase' && <PurchaseDocument order={document as PurchaseOrder} />}
        {kind === 'patient' && <PatientDocument dossier={document as PatientHistoryDocument} />}
        {kind === 'prescription' && (
          <PrescriptionDocument prescription={document as Prescription} />
        )}
        {kind === 'specialty' && <SpecialtyDocument dossier={document as SpecialtyCase} />}
        {kind === 'radiology' && <RadiologyDocument study={document as RadiologyStudy} />}
        {kind === 'coverage' && <CoverageDocument coverage={document as InsuranceCoverage} />}
        {kind === 'inventory' && <InventoryDocument inventory={document as Inventory} />}
        {kind === 'shift' && <ShiftDocument shift={document as Shift} />}
        {kind === 'attendance' && <AttendanceDocument attendance={document as Attendance} />}
        {kind === 'payroll' && <PayrollDocument payroll={document as Payroll} />}
        {kind === 'accounting' && <AccountingDocument entry={document as JournalEntry} />}
        {kind === 'care-voucher' && (
          <CareVoucherDocumentView voucher={document as CareVoucherDocument} />
        )}
        <footer className="print-footer">
          <p>{template?.footerText || profile.invoiceFooter}</p>
          <div>
            <span>Signature et cachet</span>
            <span>Document généré par le système hospitalier</span>
          </div>
        </footer>
      </article>
    </>
  );
}

function PatientIdentity({ patient }: { patient: Patient }) {
  return (
    <section className="print-patient">
      <div>
        <span>Patient</span>
        <strong>{patientName(patient)}</strong>
      </div>
      <div>
        <span>N° dossier</span>
        <strong>{patient.medicalRecordNumber}</strong>
      </div>
      <div>
        <span>Sexe</span>
        <strong>{patient.sex === 'MALE' ? 'Masculin' : 'Féminin'}</strong>
      </div>
      <div>
        <span>Date de naissance</span>
        <strong>
          {patient.dateOfBirth
            ? new Intl.DateTimeFormat('fr-FR').format(new Date(patient.dateOfBirth))
            : 'Non renseignée'}
        </strong>
      </div>
    </section>
  );
}

function FinancialDocument({
  invoice,
  kind,
  paymentId,
}: {
  invoice: Invoice;
  kind: string;
  paymentId: string;
}) {
  const payment = invoice.payments.find((entry) => entry.id === paymentId) ?? invoice.payments[0];
  return (
    <>
      <PatientIdentity patient={invoice.patient} />
      <section className="print-meta">
        <p>
          <strong>Facture :</strong> {invoice.number}
        </p>
        <p>
          <strong>Statut :</strong> {invoice.status}
        </p>
        <p>
          <strong>Date :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR').format(new Date(invoice.issuedAt))}
        </p>
      </section>
      {kind === 'invoice' ? (
        <>
          <table className="print-table">
            <thead>
              <tr>
                <th>Désignation</th>
                <th>Qté</th>
                <th>Prix unitaire</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.description}-${index}`}>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{currency(item.unitPrice)}</td>
                  <td>{currency(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>TOTAL</td>
                <td>{currency(invoice.total)}</td>
              </tr>
            </tfoot>
          </table>
          {invoice.insuranceCoverage && (
            <section className="print-meta">
              <p>
                <strong>Prise en charge :</strong>{' '}
                {invoice.insuranceCoverage.patientInsurance.provider.name}
              </p>
              <p>
                <strong>Part assureur :</strong> {currency(invoice.insuranceCoverage.insurerAmount)}{' '}
                ({Number(invoice.insuranceCoverage.coveragePercent)} %)
              </p>
              <p>
                <strong>Part patient :</strong> {currency(invoice.insuranceCoverage.patientAmount)}
              </p>
            </section>
          )}
          {invoice.voucherCoverage && (
            <section className="print-meta">
              <p>
                <strong>Bon de soins :</strong> {invoice.voucherCoverage.careVoucher.number}
              </p>
              <p>
                <strong>Organisme :</strong> {invoice.voucherCoverage.careVoucher.issuerName}
              </p>
              <p>
                <strong>Part organisme :</strong> {currency(invoice.voucherCoverage.sponsorAmount)}{' '}
                ({Number(invoice.voucherCoverage.coveragePercent)} %)
              </p>
              <p>
                <strong>Part patient :</strong> {currency(invoice.voucherCoverage.patientAmount)}
              </p>
              {invoice.voucherCoverage.reference && (
                <p>
                  <strong>Référence d’accord :</strong> {invoice.voucherCoverage.reference}
                </p>
              )}
            </section>
          )}
        </>
      ) : payment ? (
        <section className="receipt-amount">
          <span>Montant reçu</span>
          <strong>{currency(payment.amount)}</strong>
          <p>
            Payeur :{' '}
            {payment.payerType === 'INSURER'
              ? 'Assureur'
              : payment.payerType === 'SPONSOR'
                ? 'Organisme du bon de soins'
                : 'Patient'}{' '}
            · Mode : {payment.method} {payment.reference ? `· Référence ${payment.reference}` : ''}
          </p>
          <p>
            Reçu par {payment.receivedBy.username} le{' '}
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
              new Date(payment.paidAt),
            )}
          </p>
        </section>
      ) : (
        <div className="alert error">Aucun paiement enregistré.</div>
      )}
    </>
  );
}

function GroupedFinancialDocumentView({
  document,
  kind,
}: {
  document: GroupedFinancialDocument;
  kind: string;
}) {
  const payments = document.invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({ invoice, payment })),
  );
  return (
    <>
      <PatientIdentity patient={document.patient} />
      <section className="print-meta">
        <p>
          <strong>Factures regroupées :</strong> {document.invoices.length}
        </p>
        <p>
          <strong>Références :</strong>{' '}
          {document.invoices.map((invoice) => invoice.number).join(', ')}
        </p>
      </section>
      {kind === 'grouped-invoice' ? (
        <table className="print-table">
          <thead>
            <tr>
              <th>Facture</th>
              <th>Désignation</th>
              <th>Qté</th>
              <th>Prix unitaire</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {document.invoices.flatMap((invoice) =>
              invoice.items.map((item, index) => (
                <tr key={`${invoice.id}-${index}`}>
                  <td>{invoice.number}</td>
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{currency(item.unitPrice)}</td>
                  <td>{currency(item.total)}</td>
                </tr>
              )),
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>TOTAL FACTURÉ</td>
              <td>{currency(document.total)}</td>
            </tr>
            <tr>
              <td colSpan={4}>TOTAL PAYÉ</td>
              <td>{currency(document.paid)}</td>
            </tr>
            <tr>
              <td colSpan={4}>SOLDE</td>
              <td>{currency(document.balance)}</td>
            </tr>
          </tfoot>
        </table>
      ) : payments.length ? (
        <>
          <table className="print-table">
            <thead>
              <tr>
                <th>Facture</th>
                <th>Date</th>
                <th>Payeur</th>
                <th>Mode / référence</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(({ invoice, payment }) => (
                <tr key={payment.id}>
                  <td>{invoice.number}</td>
                  <td>
                    {new Intl.DateTimeFormat('fr-FR', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(payment.paidAt))}
                  </td>
                  <td>
                    {payment.payerType === 'INSURER'
                      ? 'Assureur'
                      : payment.payerType === 'SPONSOR'
                        ? 'Organisme'
                        : 'Patient'}
                  </td>
                  <td>
                    {payment.method} {payment.reference ? `· ${payment.reference}` : ''}
                  </td>
                  <td>{currency(payment.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>TOTAL REÇU</td>
                <td>{currency(document.paid)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="print-validation">
            Les paiements individuels restent conservés dans la caisse et le journal d’audit.
          </p>
        </>
      ) : (
        <div className="alert error">Aucun paiement enregistré.</div>
      )}
    </>
  );
}

function CareVoucherDocumentView({ voucher }: { voucher: CareVoucherDocument }) {
  const coverages = voucher.coverages.filter((coverage) => coverage.status !== 'CANCELLED');
  const total = coverages.reduce((sum, coverage) => sum + Number(coverage.sponsorAmount), 0);
  const overrun = voucher.ceilingAmount
    ? Math.max(0, Number(voucher.usedAmount) - Number(voucher.ceilingAmount))
    : 0;
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Garant :</strong> {voucher.issuerName}
        </p>
        <p>
          <strong>Type :</strong>{' '}
          {voucher.sponsorType === 'COMPANY' ? 'Société' : 'Personne garante'}
        </p>
        <p>
          <strong>Bon :</strong> {voucher.number}
        </p>
        <p>
          <strong>Plafond :</strong>{' '}
          {voucher.ceilingAmount ? currency(voucher.ceilingAmount) : 'Sans plafond'}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Dossier</th>
            <th>Facture</th>
            <th>Actes</th>
            <th>Montant garanti</th>
          </tr>
        </thead>
        <tbody>
          {coverages.map((coverage) => (
            <tr key={coverage.id}>
              <td>{patientName(coverage.invoice.patient)}</td>
              <td>{coverage.invoice.patient.medicalRecordNumber}</td>
              <td>{coverage.invoice.number}</td>
              <td>{coverage.invoice.items.map((item) => item.description).join(', ')}</td>
              <td>{currency(coverage.sponsorAmount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>TOTAL À FACTURER AU GARANT</td>
            <td>{currency(total)}</td>
          </tr>
          {overrun > 0 && (
            <tr>
              <td colSpan={4}>DÉPASSEMENT DU PLAFOND INDICATIF</td>
              <td>{currency(overrun)}</td>
            </tr>
          )}
        </tfoot>
      </table>
      <p className="print-validation">
        Cette facture consolidée regroupe les soins attribués au bon. Aucun montant n’est à
        encaisser auprès des patients concernés.
      </p>
    </>
  );
}

function LabDocument({ exam }: { exam: Exam }) {
  const definitions = new Map((exam.resultSchema ?? []).map((field) => [field.key, field]));
  const values = exam.resultData?.values ?? [];
  return (
    <>
      <PatientIdentity patient={exam.patient} />
      <section className="print-meta">
        <p>
          <strong>Examen :</strong> {exam.type}
        </p>
        <p>
          <strong>Demandé par :</strong> Dr {patientName(exam.requestedByDoctor)}
        </p>
        <p>
          <strong>Date :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR').format(new Date(exam.requestedAt))}
        </p>
      </section>
      <section className="print-result">
        <h3>Résultat</h3>
        {values.length ? (
          <table className="print-table lab-print-result-table">
            <thead>
              <tr>
                <th>Rubrique</th>
                <th>Résultat</th>
                <th>Unité</th>
                <th>Valeurs de référence</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {values.map((entry) => {
                const definition = definitions.get(entry.key);
                return (
                  <tr key={entry.key}>
                    <td>{definition?.label ?? entry.key}</td>
                    <td>
                      <strong>{entry.value}</strong>
                    </td>
                    <td>{definition?.unit || '—'}</td>
                    <td>{definition?.reference || 'Selon méthode / patient'}</td>
                    <td>{entry.note || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>{exam.result || 'Résultat non disponible.'}</p>
        )}
        {exam.resultData?.conclusion && (
          <>
            <h3>Conclusion / interprétation</h3>
            <p>{exam.resultData.conclusion}</p>
          </>
        )}
        {exam.observations && (
          <>
            <h3>Observations cliniques</h3>
            <p>{exam.observations}</p>
          </>
        )}
      </section>
      <p className="print-validation">
        Validation : {exam.validatedByLabTech ? patientName(exam.validatedByLabTech) : 'En attente'}{' '}
        {exam.validatedAt
          ? `— ${new Intl.DateTimeFormat('fr-FR').format(new Date(exam.validatedAt))}`
          : ''}
      </p>
    </>
  );
}

function ClinicalDocument({ order }: { order: ClinicalOrder }) {
  return (
    <>
      <PatientIdentity patient={order.patient} />
      <section className="print-meta">
        <p>
          <strong>Acte :</strong> {order.service.name}
        </p>
        <p>
          <strong>Catégorie :</strong> {order.type}
        </p>
        <p>
          <strong>Priorité :</strong> {order.priority}
        </p>
        <p>
          <strong>Prescripteur :</strong> {order.requestedBy.username}
        </p>
      </section>
      <section className="print-result">
        <h3>Indication</h3>
        <p>{order.clinicalIndication}</p>
        <h3>Compte rendu / résultat</h3>
        <p>{order.result || 'Non disponible.'}</p>
        {order.notes && (
          <>
            <h3>Notes</h3>
            <p>{order.notes}</p>
          </>
        )}
      </section>
      <p className="print-validation">
        Réalisé par : {order.performedBy?.username ?? '—'} · Statut : {order.status}
      </p>
    </>
  );
}

function TransfusionDocument({ transfusion }: { transfusion: Transfusion }) {
  return (
    <>
      <PatientIdentity patient={transfusion.patient} />
      <section className="print-meta">
        <p>
          <strong>Poche :</strong> {transfusion.bloodUnit.code}
        </p>
        <p>
          <strong>Produit :</strong> {transfusion.bloodUnit.component} ·{' '}
          {transfusion.bloodUnit.bloodType} · {transfusion.bloodUnit.volumeMl} ml
        </p>
        <p>
          <strong>Cross-match :</strong> {transfusion.crossmatchReference}
        </p>
        <p>
          <strong>Statut :</strong> {transfusion.status}
        </p>
        <p>
          <strong>Paiement :</strong>{' '}
          {transfusion.clinicalOrder.careAuthorization?.paymentClearance?.inOrder ||
          ['AUTHORIZED', 'WAIVED', 'CONSUMED'].includes(
            transfusion.clinicalOrder.careAuthorization?.status ?? '',
          )
            ? 'En ordre'
            : 'À régulariser'}
        </p>
      </section>
      <section className="print-result">
        <h3>Indication</h3>
        <p>{transfusion.indication}</p>
        <h3>Traçabilité</h3>
        <p>Prescrit par : {transfusion.prescribedBy.username}</p>
        <p>Administré par : {transfusion.administeredBy?.username ?? 'Non renseigné'}</p>
        <p>
          Début :{' '}
          {transfusion.startedAt
            ? new Intl.DateTimeFormat('fr-FR', {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(transfusion.startedAt))
            : 'Non démarrée'}
        </p>
        <h3>Réactions / observations</h3>
        <p>{transfusion.reactionNotes || 'Aucune réaction documentée.'}</p>
      </section>
    </>
  );
}

function PurchaseDocument({ order }: { order: PurchaseOrder }) {
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Commande :</strong> {order.number}
        </p>
        <p>
          <strong>Fournisseur :</strong> {order.supplier.name} ({order.supplier.code})
        </p>
        <p>
          <strong>Coordonnées :</strong>{' '}
          {[order.supplier.phone, order.supplier.email, order.supplier.address]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
        <p>
          <strong>Créée par :</strong> {order.createdBy.username} · <strong>Statut :</strong>{' '}
          {order.status}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Désignation</th>
            <th>Qté</th>
            <th>Reçue</th>
            <th>Coût unitaire</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, index) => (
            <tr key={`${item.description}-${index}`}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{item.receivedQuantity}</td>
              <td>{currency(item.unitCost)}</td>
              <td>{currency(item.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>TOTAL</td>
            <td>{currency(order.total)}</td>
          </tr>
        </tfoot>
      </table>
      {order.notes && <p className="print-validation">Notes : {order.notes}</p>}
    </>
  );
}

function PatientDocument({ dossier }: { dossier: PatientHistoryDocument }) {
  const { patient, entries, counts } = dossier;
  const fields = Array.isArray(patient.customFields)
    ? (patient.customFields as Array<{ definition: { label: string }; value: unknown }>)
    : [];
  const histories = [
    ['Rendez-vous', counts.APPOINTMENT ?? 0],
    ['Consultations', counts.CONSULTATION ?? 0],
    ['Examens de laboratoire', counts.LABORATORY ?? 0],
    ['Hospitalisations', counts.HOSPITALIZATION ?? 0],
    ['Ordonnances', counts.PRESCRIPTION ?? 0],
    ['Soins infirmiers', counts.NURSING ?? 0],
    ['Imagerie', counts.RADIOLOGY ?? 0],
  ];
  const labels: Record<string, string> = {
    APPOINTMENT: 'Rendez-vous',
    CONSULTATION: 'Consultation',
    LABORATORY: 'Laboratoire',
    HOSPITALIZATION: 'Hospitalisation',
    VITAL_SIGN: 'Paramètres vitaux',
    PRESCRIPTION: 'Ordonnance',
    NURSING: 'Soin infirmier',
    CLINICAL_ORDER: 'Acte clinique',
    SPECIALTY: 'Dossier spécialisé',
    RADIOLOGY: 'Imagerie',
  };
  return (
    <>
      <PatientIdentity patient={patient} />
      <section className="print-meta">
        <p>
          <strong>Téléphone :</strong> {patient.phone || '—'}
        </p>
        <p>
          <strong>Adresse :</strong> {patient.address || '—'}
        </p>
        <p>
          <strong>Groupe sanguin :</strong> {patient.bloodType || '—'}
        </p>
        <p>
          <strong>Contact urgence :</strong> {patient.emergencyContact || '—'}
        </p>
        {fields.map((field) => (
          <p key={field.definition.label}>
            <strong>{field.definition.label} :</strong> {String(field.value)}
          </p>
        ))}
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Historique récent</th>
            <th>Nombre d’éléments</th>
          </tr>
        </thead>
        <tbody>
          {histories.map(([label, count]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > 0 && (
        <>
          <h3>Historique médical complet — du plus récent au plus ancien</h3>
          <table className="print-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Rubrique</th>
                <th>Événement</th>
                <th>Statut</th>
                <th>Détails / résultat</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.kind}-${entry.id}`}>
                  <td>
                    {new Intl.DateTimeFormat('fr-CD', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(entry.date))}
                  </td>
                  <td>{labels[entry.kind] ?? entry.kind}</td>
                  <td>{entry.title}</td>
                  <td>{entry.status ?? '—'}</td>
                  <td>{entry.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function PrescriptionDocument({ prescription }: { prescription: Prescription }) {
  return (
    <>
      <PatientIdentity patient={prescription.patient} />
      <section className="print-meta">
        <p>
          <strong>Ordonnance :</strong> {prescription.number}
        </p>
        <p>
          <strong>Prescripteur :</strong> {prescription.prescribedBy.username}
        </p>
        <p>
          <strong>Diagnostic :</strong> {prescription.diagnosis || '—'}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Médicament</th>
            <th>Dosage</th>
            <th>Fréquence</th>
            <th>Voie</th>
            <th>Durée</th>
            <th>Qté</th>
          </tr>
        </thead>
        <tbody>
          {prescription.items.map((item, index) => (
            <tr key={`${item.medicationName || item.medication?.name || 'medicament'}-${index}`}>
              <td>
                {item.medicationName || item.medication?.name || 'Médicament'}{' '}
                {item.strength || item.medication?.strength}
                {item.availability !== 'INTERNAL' ? ' — achat extérieur' : ''}
              </td>
              <td>{item.dosage}</td>
              <td>{item.frequency}</td>
              <td>{item.route}</td>
              <td>{item.durationDays} jour(s)</td>
              <td>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="print-result">
        <h3>Instructions générales</h3>
        <p>{prescription.generalInstructions || '—'}</p>
      </section>
    </>
  );
}

function SpecialtyDocument({ dossier }: { dossier: SpecialtyCase }) {
  return (
    <>
      <PatientIdentity patient={dossier.patient} />
      <section className="print-meta">
        <p>
          <strong>Spécialité :</strong> {dossier.specialty}
        </p>
        <p>
          <strong>Dossier :</strong> {dossier.title}
        </p>
        <p>
          <strong>Responsable :</strong> {dossier.responsible.username}
        </p>
        <p>
          <strong>Statut :</strong> {dossier.status}
        </p>
      </section>
      <section className="print-result">
        <h3>Diagnostic</h3>
        <p>{dossier.diagnosis || '—'}</p>
        <h3>Compte rendu</h3>
        <p>{dossier.report || 'Compte rendu non disponible.'}</p>
        <h3>Données structurées</h3>
        <p>{JSON.stringify(dossier.structuredData, null, 2)}</p>
      </section>
    </>
  );
}

function RadiologyDocument({ study }: { study: RadiologyStudy }) {
  return (
    <>
      <PatientIdentity patient={study.patient} />
      <section className="print-meta">
        <p>
          <strong>Accession :</strong> {study.accessionNumber}
        </p>
        <p>
          <strong>Modalité :</strong> {study.modality}
        </p>
        <p>
          <strong>Région :</strong> {study.bodyPart}
        </p>
        <p>
          <strong>Statut :</strong> {study.status}
        </p>
        <p>
          <strong>Study Instance UID :</strong> {study.studyInstanceUid || '—'}
        </p>
        <p>
          <strong>Images DICOM :</strong> {study.instances.length}
        </p>
      </section>
      <section className="print-result">
        <h3>Indication</h3>
        <p>{study.indication}</p>
        <h3>Compte rendu radiologique</h3>
        <p>{study.report || 'Compte rendu non disponible.'}</p>
      </section>
      <p className="print-validation">Radiologue : {study.performedBy?.username ?? '—'}</p>
    </>
  );
}

function CoverageDocument({ coverage }: { coverage: InsuranceCoverage }) {
  const patientPaid = coverage.invoice.payments
    .filter((payment) => payment.payerType === 'PATIENT')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  const insurerPaid = coverage.invoice.payments
    .filter((payment) => payment.payerType === 'INSURER')
    .reduce((sum, payment) => sum + Number(payment.amount), 0);
  return (
    <>
      <PatientIdentity patient={coverage.invoice.patient} />
      <section className="print-meta">
        <p>
          <strong>Facture :</strong> {coverage.invoice.number}
        </p>
        <p>
          <strong>Assureur :</strong> {coverage.patientInsurance.provider.name}
        </p>
        <p>
          <strong>N° assuré :</strong> {coverage.patientInsurance.memberNumber}
        </p>
        <p>
          <strong>Garantie :</strong> {coverage.guaranteeReference || 'En attente'}
        </p>
        <p>
          <strong>Statut :</strong> {coverage.status}
        </p>
        <p>
          <strong>Créé par :</strong> {coverage.createdBy.username}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Partie</th>
            <th>Pourcentage</th>
            <th>Montant dû</th>
            <th>Montant encaissé</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Patient</td>
            <td>{100 - Number(coverage.coveragePercent)} %</td>
            <td>{currency(coverage.patientAmount)}</td>
            <td>{currency(patientPaid)}</td>
          </tr>
          <tr>
            <td>Assureur</td>
            <td>{Number(coverage.coveragePercent)} %</td>
            <td>{currency(coverage.insurerAmount)}</td>
            <td>{currency(insurerPaid)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>TOTAL FACTURE</td>
            <td colSpan={2}>{currency(coverage.grossAmount)}</td>
          </tr>
        </tfoot>
      </table>
      {coverage.notes && <p className="print-validation">Observations : {coverage.notes}</p>}
    </>
  );
}

function InventoryDocument({ inventory }: { inventory: Inventory }) {
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Référence :</strong> {inventory.reference}
        </p>
        <p>
          <strong>Statut :</strong> {inventory.status}
        </p>
        <p>
          <strong>Compté par :</strong> {inventory.countedBy.username}
        </p>
        <p>
          <strong>Date :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR').format(new Date(inventory.startedAt))}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Médicament</th>
            <th>Stock théorique</th>
            <th>Stock compté</th>
            <th>Écart</th>
          </tr>
        </thead>
        <tbody>
          {inventory.lines.map((line, index) => {
            const medicationName =
              line.medication?.name ?? line.medicationName ?? 'Médicament non référencé';
            const strength = line.medication?.strength ?? line.strength ?? '';

            return (
              <tr key={`${medicationName}-${strength}-${index}`}>
                <td>
                  {medicationName} {strength}
                </td>
                <td>{line.expectedQuantity}</td>
                <td>{line.countedQuantity}</td>
                <td>{line.difference}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {inventory.notes && <p className="print-validation">Notes : {inventory.notes}</p>}
    </>
  );
}

function ShiftDocument({ shift }: { shift: Shift }) {
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Employé :</strong> {shift.employee.username}
        </p>
        <p>
          <strong>Fonction :</strong> {shift.employee.role}
        </p>
        <p>
          <strong>Service :</strong> {shift.service}
        </p>
        <p>
          <strong>Lieu :</strong> {shift.location || '—'}
        </p>
        <p>
          <strong>Début :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(shift.startsAt))}
        </p>
        <p>
          <strong>Fin :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(new Date(shift.endsAt))}
        </p>
        <p>
          <strong>Statut :</strong> {shift.status}
        </p>
      </section>
      {shift.notes && (
        <section className="print-result">
          <h3>Consignes</h3>
          <p>{shift.notes}</p>
        </section>
      )}
    </>
  );
}

function AttendanceDocument({ attendance }: { attendance: Attendance }) {
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Employé :</strong> {attendance.employee.username}
        </p>
        <p>
          <strong>Fonction :</strong> {attendance.employee.role}
        </p>
        <p>
          <strong>Date :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR').format(new Date(attendance.date))}
        </p>
        <p>
          <strong>Statut :</strong> {attendance.status}
        </p>
        <p>
          <strong>Entrée :</strong>{' '}
          {attendance.clockIn
            ? new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(
                new Date(attendance.clockIn),
              )
            : '—'}
        </p>
        <p>
          <strong>Sortie :</strong>{' '}
          {attendance.clockOut
            ? new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(
                new Date(attendance.clockOut),
              )
            : '—'}
        </p>
        <p>
          <strong>Retard :</strong> {attendance.minutesLate} minute(s)
        </p>
      </section>
      {attendance.notes && <p className="print-validation">Notes : {attendance.notes}</p>}
    </>
  );
}

function PayrollDocument({ payroll }: { payroll: Payroll }) {
  const total = payroll.entries.reduce((sum, entry) => sum + Number(entry.netSalary), 0);
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Période :</strong> {payroll.label}
        </p>
        <p>
          <strong>Du :</strong>{' '}
          {new Intl.DateTimeFormat('fr-FR').format(new Date(payroll.startsOn))}
        </p>
        <p>
          <strong>Au :</strong> {new Intl.DateTimeFormat('fr-FR').format(new Date(payroll.endsOn))}
        </p>
        <p>
          <strong>Statut :</strong> {payroll.status}
        </p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Employé</th>
            <th>Base</th>
            <th>Primes + heures</th>
            <th>Retenues + taxes</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          {payroll.entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.employee.username}</td>
              <td>{currency(entry.baseSalary)}</td>
              <td>{currency(Number(entry.allowances) + Number(entry.overtime))}</td>
              <td>{currency(Number(entry.deductions) + Number(entry.taxes))}</td>
              <td>{currency(entry.netSalary)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>TOTAL NET</td>
            <td>{currency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}

function AccountingDocument({ entry }: { entry: JournalEntry }) {
  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  return (
    <>
      <section className="print-meta">
        <p>
          <strong>Écriture :</strong> {entry.number}
        </p>
        <p>
          <strong>Date :</strong> {new Intl.DateTimeFormat('fr-FR').format(new Date(entry.date))}
        </p>
        <p>
          <strong>Statut :</strong> {entry.status}
        </p>
        <p>
          <strong>Référence :</strong> {entry.reference || '—'}
        </p>
        <p>
          <strong>Saisi par :</strong> {entry.createdBy.username}
        </p>
      </section>
      <section className="print-result">
        <h3>Libellé</h3>
        <p>{entry.description}</p>
      </section>
      <table className="print-table">
        <thead>
          <tr>
            <th>Compte</th>
            <th>Libellé</th>
            <th>Débit</th>
            <th>Crédit</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line, index) => (
            <tr key={`${line.account.code}-${index}`}>
              <td>
                {line.account.code} · {line.account.name}
              </td>
              <td>{line.description || entry.description}</td>
              <td>{currency(line.debit)}</td>
              <td>{currency(line.credit)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>TOTAUX</td>
            <td>{currency(debit)}</td>
            <td>{currency(credit)}</td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
