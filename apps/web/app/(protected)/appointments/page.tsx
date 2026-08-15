'use client';

import {
  Activity,
  CalendarClock,
  CalendarPlus,
  Eye,
  FlaskConical,
  HeartPulse,
  History,
  Plus,
  RotateCcw,
  Stethoscope,
  UserRoundCheck,
  WalletCards,
  Send,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CustomFieldsEditor } from '@/components/custom-fields-editor';
import { ListFilters } from '@/components/list-filters';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import {
  currency,
  isiroLocalDateTimeToDate,
  localDateTimeInputValue,
  matchesSearch,
  patientName,
} from '@/lib/display';
import { hasAnyRole } from '@/lib/roles';
import { Patient } from '@/lib/types';

interface DoctorAvailability {
  id: string;
  name: string;
  specialty: string;
  availability: 'AVAILABLE' | 'BUSY' | 'UNKNOWN';
  attendanceStatus?: string | null;
  onDuty: boolean;
  currentPatient?: Patient | null;
  waitingPatients: Patient[];
}

interface VitalSign {
  weightKg?: string;
  heightCm?: string;
  temperatureC?: string;
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  respiratoryRate?: number;
  oxygenPercent?: number;
  bloodGlucoseMgDl?: number;
  notes?: string;
  recordedAt: string;
}

interface Appointment {
  id: string;
  scheduledAt: string;
  service: string;
  reason?: string;
  status: string;
  journeyStage: string;
  journeyUpdatedAt: string;
  doctorAcknowledgedAt?: string;
  patient: Patient & { vitalSigns?: VitalSign[] };
  doctor?: {
    id: string;
    lastName: string;
    postName?: string;
    firstName?: string;
    specialty: string;
  };
  careAuthorization?: {
    status: string;
    invoice?: { id: string; number: string; status: string; total: string; payments: Payment[] };
    paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
  };
  consultation?: {
    id: string;
    status: string;
    examRequests: Array<{ id: string; type: string; status: string }>;
  };
}

interface BillableService {
  id: string;
  code?: string;
  name: string;
  price?: string;
}

interface Payment {
  id: string;
  amount: string;
  payerType: 'PATIENT' | 'INSURER' | 'SPONSOR';
}

interface Invoice {
  id: string;
  number: string;
  status: string;
  total: string;
  patient: Patient;
  payments: Payment[];
  careAuthorization?: { id: string; description: string; status: string };
  insuranceCoverage?: { patientAmount: string; insurerAmount: string };
  voucherCoverage?: { patientAmount: string; sponsorAmount: string };
}

interface PatientFinancialSummary {
  file: {
    active: boolean;
    validUntil?: string | null;
    pending?: { invoiceId: string; invoiceNumber: string; amount: number; status: string } | null;
  };
  outstandingBalance: number;
  financialHold: boolean;
  death: { deceased: boolean };
}

const emptyForm = {
  patientId: '',
  doctorId: '',
  scheduledAt: '',
  reason: '',
};

const emptyVitals = {
  temperatureC: '',
  weightKg: '',
  heightCm: '',
  systolic: '',
  diastolic: '',
  pulse: '',
  respiratoryRate: '',
  oxygenPercent: '',
  bloodGlucoseMgDl: '',
  notes: '',
};

const vitalFields = [
  ['temperatureC', 'Température (°C)'],
  ['weightKg', 'Poids (kg)'],
  ['heightCm', 'Taille (cm)'],
  ['systolic', 'Tension systolique'],
  ['diastolic', 'Tension diastolique'],
  ['pulse', 'Fréquence cardiaque / min'],
  ['respiratoryRate', 'Fréquence respiratoire / min'],
  ['oxygenPercent', 'Saturation O₂ (%)'],
  ['bloodGlucoseMgDl', 'Glycémie (mg/dL)'],
] as const;

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<'active' | 'history'>('active');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<DoctorAvailability[]>([]);
  const [services, setServices] = useState<BillableService[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [minimumScheduledAt, setMinimumScheduledAt] = useState('');
  const [vitals, setVitals] = useState(emptyVitals);
  const [createOpen, setCreateOpen] = useState(false);
  const [directReferral, setDirectReferral] = useState(false);
  const [appointmentFinancialSummary, setAppointmentFinancialSummary] =
    useState<PatientFinancialSummary | null>(null);
  const [financialChecking, setFinancialChecking] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingPatient, setBillingPatient] = useState<Patient | null>(null);
  const [billingSummary, setBillingSummary] = useState<PatientFinancialSummary | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<Invoice[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [appointmentInvoiceId, setAppointmentInvoiceId] = useState<string | null>(null);
  const [billingOrigin, setBillingOrigin] = useState<
    'FORM' | 'CREATED_APPOINTMENT' | 'LIST' | null
  >(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [payment, setPayment] = useState({
    amount: '',
    method: 'CASH',
    payerType: 'PATIENT',
    reference: '',
  });
  const [transferring, setTransferring] = useState<Appointment | null>(null);
  const [transfer, setTransfer] = useState({ doctorId: '', reason: '' });
  const [doctorsOpen, setDoctorsOpen] = useState(false);
  const [vitalAppointment, setVitalAppointment] = useState<Appointment | null>(null);
  const [viewing, setViewing] = useState<Appointment | null>(null);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canManageAppointments = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
  ]);
  const canCreateAppointment = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'CASHIER',
  ]);
  const canManageMoney = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'CASHIER', 'ACCOUNTANT']);
  const canRecordVitals = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'RECEPTIONIST',
    'SECRETARY',
    'NURSE',
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [appointmentRows, patientRows, availabilityRows, serviceRows] = await Promise.all([
        api<Appointment[]>(`/appointments?scope=${scope}`),
        api<{ items: Patient[] }>('/patients/lookup?limit=100'),
        api<DoctorAvailability[]>('/appointments/doctors/availability'),
        api<BillableService[]>('/billing/services?type=CONSULTATION'),
      ]);
      setAppointments(appointmentRows);
      setPatients(patientRows.items);
      setDoctors(availabilityRows);
      setServices(serviceRows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement impossible.');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    if (!createOpen || !canManageMoney || !form.patientId) {
      setAppointmentFinancialSummary(null);
      setFinancialChecking(false);
      return;
    }

    setFinancialChecking(true);
    void api<PatientFinancialSummary>(`/patient-financial-access/${form.patientId}`)
      .then((summary) => {
        if (!cancelled) setAppointmentFinancialSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setAppointmentFinancialSummary(null);
      })
      .finally(() => {
        if (!cancelled) setFinancialChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManageMoney, createOpen, form.patientId]);

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

  const refreshPatientBilling = async (patientId: string) => {
    setBillingLoading(true);
    try {
      const [summary, invoices] = await Promise.all([
        api<PatientFinancialSummary>(`/patient-financial-access/${patientId}`),
        api<Invoice[]>(`/billing/invoices?patientId=${encodeURIComponent(patientId)}`),
      ]);
      setBillingSummary(summary);
      setBillingInvoices(invoices);
      return { summary, invoices };
    } finally {
      setBillingLoading(false);
    }
  };

  const selectInvoiceForPayment = (invoice: Invoice) => {
    const payerType =
      remainingForPayer(invoice, 'PATIENT') > 0
        ? 'PATIENT'
        : invoice.voucherCoverage
          ? 'SPONSOR'
          : invoice.insuranceCoverage
            ? 'INSURER'
            : 'PATIENT';
    setPaying(invoice);
    setPayment({
      amount: String(remainingForPayer(invoice, payerType)),
      method: 'CASH',
      payerType,
      reference: '',
    });
  };

  const openPatientBilling = async (
    patient: Patient,
    origin: 'FORM' | 'CREATED_APPOINTMENT' | 'LIST',
    targetInvoiceId?: string,
  ) => {
    setError('');
    setCreateOpen(false);
    setBillingPatient(patient);
    setBillingOrigin(origin);
    setAppointmentInvoiceId(targetInvoiceId ?? null);
    setPaying(null);
    setBillingOpen(true);
    try {
      const { invoices } = await refreshPatientBilling(patient.id);
      const target = targetInvoiceId
        ? invoices.find((invoice) => invoice.id === targetInvoiceId)
        : undefined;
      if (target && !['PAID', 'CANCELLED'].includes(target.status)) {
        selectInvoiceForPayment(target);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Facturation du patient inaccessible.');
    }
  };

  const closePatientBilling = () => {
    const returnToForm = billingOrigin === 'FORM';
    const refreshAppointments = billingOrigin !== 'FORM';
    setBillingOpen(false);
    setBillingPatient(null);
    setBillingSummary(null);
    setBillingInvoices([]);
    setPaying(null);
    setAppointmentInvoiceId(null);
    setBillingOrigin(null);
    if (returnToForm) setCreateOpen(true);
    else setForm(emptyForm);
    if (refreshAppointments) void load();
  };

  const preparePatientFile = async () => {
    if (!billingPatient) return;
    setSubmitting(true);
    setError('');
    try {
      const authorization = await api<{ invoiceId: string }>(
        `/patient-financial-access/${billingPatient.id}/file-renewal`,
        { method: 'POST' },
      );
      const { invoices } = await refreshPatientBilling(billingPatient.id);
      const invoice = invoices.find((entry) => entry.id === authorization.invoiceId);
      if (invoice) selectInvoiceForPayment(invoice);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Fiche patient impossible à préparer.');
    } finally {
      setSubmitting(false);
    }
  };

  const payInvoice = async (event: FormEvent) => {
    event.preventDefault();
    if (!paying || !billingPatient) return;
    const maximum = remainingForPayer(paying, payment.payerType);
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > maximum) {
      setError(`Le montant doit être compris entre 0 et ${currency(maximum)}.`);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api(`/billing/invoices/${paying.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          ...payment,
          amount,
          reference: payment.reference || undefined,
        }),
      });
      const { summary, invoices } = await refreshPatientBilling(billingPatient.id);
      const updatedTarget = appointmentInvoiceId
        ? invoices.find((invoice) => invoice.id === appointmentInvoiceId)
        : undefined;
      if (
        appointmentInvoiceId &&
        updatedTarget &&
        (['PAID', 'CANCELLED'].includes(updatedTarget.status) ||
          ['AUTHORIZED', 'WAIVED', 'CONSUMED'].includes(
            updatedTarget.careAuthorization?.status ?? '',
          ))
      ) {
        setBillingOpen(false);
        setBillingPatient(null);
        setBillingSummary(null);
        setBillingInvoices([]);
        setPaying(null);
        setAppointmentInvoiceId(null);
        setBillingOrigin(null);
        setForm(emptyForm);
        setScope('active');
        await load();
      } else {
        setPaying(null);
        setPayment({ amount: '', method: 'CASH', payerType: 'PATIENT', reference: '' });
        if (!summary.financialHold && billingOrigin === 'FORM') {
          setAppointmentFinancialSummary(summary);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Paiement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    const scheduledAt = directReferral ? null : isiroLocalDateTimeToDate(form.scheduledAt);
    if (
      !directReferral &&
      (!scheduledAt ||
        Number.isNaN(scheduledAt.getTime()) ||
        scheduledAt.getTime() < Date.now() - 2 * 60_000)
    ) {
      setError('Choisissez une date et une heure futures selon l’heure d’Isiro.');
      return;
    }
    const consultationService = services.find((entry) => entry.code === 'CONS-GEN') ?? services[0];
    if (!consultationService) {
      setError(
        'Le service de consultation générale est introuvable. Activez-le dans le catalogue de facturation.',
      );
      return;
    }
    setSubmitting(true);
    try {
      const service = consultationService.name;
      const created = await api<Appointment>(
        directReferral ? '/appointments/direct-referral' : '/appointments',
        {
          method: 'POST',
          body: JSON.stringify(
            directReferral
              ? {
                  patientId: form.patientId,
                  doctorId: form.doctorId,
                  billableServiceId: consultationService.id,
                  reason: form.reason || undefined,
                  service,
                }
              : {
                  ...form,
                  billableServiceId: consultationService.id,
                  service,
                  scheduledAt: scheduledAt!.toISOString(),
                },
          ),
        },
      );
      setScope('active');
      const invoice = created.careAuthorization?.invoice;
      if (canManageMoney && invoice && !['PAID', 'CANCELLED'].includes(invoice.status)) {
        await openPatientBilling(created.patient, 'CREATED_APPOINTMENT', invoice.id);
      } else {
        setCreateOpen(false);
        setForm(emptyForm);
        await load();
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitTransfer = async (event: FormEvent) => {
    event.preventDefault();
    if (!transferring) return;
    setSubmitting(true);
    setError('');
    try {
      await api(`/appointments/${transferring.id}/transfer`, {
        method: 'PATCH',
        body: JSON.stringify({
          doctorId: transfer.doctorId,
          reason: transfer.reason || 'Réaffectation avant la prise en charge médicale',
        }),
      });
      setTransferring(null);
      setTransfer({ doctorId: '', reason: '' });
      setScope('active');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Réaffectation impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    setError('');
    setSubmitting(true);
    try {
      await api(`/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mise à jour impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const recordVitals = async (event: FormEvent) => {
    event.preventDefault();
    if (!vitalAppointment) return;
    setSubmitting(true);
    setError('');
    try {
      const payload = Object.fromEntries(
        Object.entries(vitals)
          .filter(([, value]) => value !== '')
          .map(([key, value]) => [key, key === 'notes' ? value : Number(value)]),
      );
      await api(`/appointments/${vitalAppointment.id}/vitals`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setVitalAppointment(null);
      setVitals(emptyVitals);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Signes vitaux impossibles à enregistrer.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(
    () =>
      appointments.filter(
        (row) =>
          (!stageFilter || row.journeyStage === stageFilter || row.status === stageFilter) &&
          matchesSearch(
            query,
            patientName(row.patient),
            row.patient.medicalRecordNumber,
            row.service,
            row.reason,
            row.doctor ? patientName(row.doctor) : '',
          ),
      ),
    [appointments, query, stageFilter],
  );

  const doctorSummary = useMemo(() => {
    const available = doctors.filter((doctor) => doctor.availability === 'AVAILABLE').length;
    const busy = doctors.filter((doctor) => doctor.availability === 'BUSY').length;
    const unavailable = doctors.length - available - busy;
    const waiting = doctors.reduce((sum, doctor) => sum + doctor.waitingPatients.length, 0);
    return { available, busy, unavailable, waiting };
  }, [doctors]);
  const selectedFormPatient = patients.find((patient) => patient.id === form.patientId);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Réception et agenda clinique</span>
          <h1>Rendez-vous</h1>
          <p>Un patient actif apparaît une seule fois pendant son parcours.</p>
        </div>
        {canCreateAppointment && (
          <div className="row-actions">
            {canManageAppointments && (
              <button
                className="secondary-button"
                onClick={() => {
                  setDirectReferral(true);
                  setForm(emptyForm);
                  setError('');
                  setCreateOpen(true);
                }}
              >
                <Send size={18} /> Transfert direct
              </button>
            )}
            <button
              className="primary-button"
              onClick={() => {
                setDirectReferral(false);
                const now = new Date();
                setMinimumScheduledAt(localDateTimeInputValue(now));
                setForm({
                  ...emptyForm,
                  scheduledAt: localDateTimeInputValue(new Date(now.getTime() + 15 * 60_000)),
                });
                setError('');
                setCreateOpen(true);
              }}
            >
              <Plus size={18} /> Nouveau rendez-vous
            </button>
          </div>
        )}
      </div>

      <div className="segmented-control" role="tablist" aria-label="Vue des rendez-vous">
        <button className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>
          <CalendarClock size={17} /> Actifs et à venir
        </button>
        <button className={scope === 'history' ? 'active' : ''} onClick={() => setScope('history')}>
          <History size={17} /> Historique
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {scope === 'active' && (
        <section className="appointment-stage-summary doctor-availability-summary">
          <button className="appointment-stage-card" onClick={() => setDoctorsOpen(true)}>
            <UserRoundCheck size={19} />
            <span>Disponibles</span>
            <strong>{doctorSummary.available}</strong>
          </button>
          <button className="appointment-stage-card" onClick={() => setDoctorsOpen(true)}>
            <Stethoscope size={19} />
            <span>Occupés</span>
            <strong>{doctorSummary.busy}</strong>
          </button>
          <button className="appointment-stage-card" onClick={() => setDoctorsOpen(true)}>
            <CalendarClock size={19} />
            <span>Hors service</span>
            <strong>{doctorSummary.unavailable}</strong>
          </button>
          <button className="appointment-stage-card" onClick={() => setDoctorsOpen(true)}>
            <UserRoundCheck size={19} />
            <span>File totale</span>
            <strong>{doctorSummary.waiting}</strong>
          </button>
        </section>
      )}

      {scope === 'active' && (
        <section className="appointment-stage-summary">
          {[
            { stage: 'AWAITING_PAYMENT', label: 'Paiement attendu', icon: WalletCards },
            { stage: 'WAITING_DOCTOR', label: 'Salle d’attente', icon: Stethoscope },
            { stage: 'LABORATORY', label: 'Au laboratoire', icon: FlaskConical },
            { stage: 'RETURN_TO_DOCTOR', label: 'Retour médecin', icon: RotateCcw },
          ].map(({ stage, label, icon: Icon }) => (
            <button
              className={`appointment-stage-card${stageFilter === stage ? ' active' : ''}`}
              key={stage}
              onClick={() => setStageFilter((current) => (current === stage ? '' : stage))}
            >
              <Icon size={19} />
              <span>{label}</span>
              <strong>{appointments.filter((item) => item.journeyStage === stage).length}</strong>
            </button>
          ))}
        </section>
      )}

      <section className="panel table-panel">
        <ListFilters
          query={query}
          onQueryChange={setQuery}
          placeholder="Patient, dossier, médecin ou service…"
          status={stageFilter}
          onStatusChange={setStageFilter}
          statusOptions={
            scope === 'active'
              ? [
                  { value: 'AWAITING_PAYMENT', label: 'Paiement attendu' },
                  { value: 'WAITING_DOCTOR', label: 'Salle d’attente' },
                  { value: 'IN_CONSULTATION', label: 'Chez le médecin' },
                  { value: 'LABORATORY', label: 'Au laboratoire' },
                  { value: 'RETURN_TO_DOCTOR', label: 'Retour médecin' },
                  { value: 'HOSPITALIZATION', label: 'Vers hospitalisation' },
                ]
              : [
                  { value: 'COMPLETED', label: 'Terminé' },
                  { value: 'CANCELLED', label: 'Annulé' },
                  { value: 'NO_SHOW', label: 'Absent' },
                ]
          }
          resultCount={filtered.length}
          resultLabel={scope === 'active' ? 'parcours actif(s)' : 'rendez-vous archivé(s)'}
          allLabel="Tous"
        />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date et heure</th>
                <th>Patient</th>
                <th>Service</th>
                <th>Médecin</th>
                <th>Étape</th>
                <th>Paiement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Activity className="spin" /> Chargement…
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <CalendarPlus />
                      <strong>Aucun rendez-vous</strong>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const latestVitals = row.patient.vitalSigns?.[0];
                  return (
                    <tr key={row.id}>
                      <td>
                        {new Intl.DateTimeFormat('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(row.scheduledAt))}
                      </td>
                      <td>
                        <strong>{patientName(row.patient)}</strong>
                        <br />
                        <span className="muted">{row.patient.medicalRecordNumber}</span>
                        {latestVitals && (
                          <small className="vital-summary">
                            {latestVitals.temperatureC
                              ? `${Number(latestVitals.temperatureC)} °C`
                              : 'Temp. —'}{' '}
                            ·{' '}
                            {latestVitals.systolic && latestVitals.diastolic
                              ? `TA ${latestVitals.systolic}/${latestVitals.diastolic}`
                              : 'TA —'}
                          </small>
                        )}
                      </td>
                      <td>
                        {row.service}
                        <br />
                        <span className="muted">{row.reason || '—'}</span>
                      </td>
                      <td>{row.doctor ? patientName(row.doctor) : 'Non assigné'}</td>
                      <td>
                        <StatusBadge status={scope === 'history' ? row.status : row.journeyStage} />
                      </td>
                      <td>
                        <StatusBadge status={row.careAuthorization?.status ?? 'PENDING'} />
                        {canManageMoney && row.careAuthorization?.invoice ? (
                          <>
                            <br />
                            <span className="muted">{row.careAuthorization.invoice.number}</span>
                          </>
                        ) : row.careAuthorization ? (
                          <>
                            <br />
                            <span className="muted">
                              {row.careAuthorization.paymentClearance?.inOrder
                                ? 'Paiement en ordre'
                                : 'Paiement à régulariser'}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="text-button" onClick={() => setViewing(row)}>
                            <Eye size={15} /> Détails
                          </button>
                          {scope === 'active' &&
                            row.status === 'SCHEDULED' &&
                            canManageAppointments && (
                              <button
                                className="text-button"
                                disabled={
                                  submitting ||
                                  !row.careAuthorization ||
                                  !['AUTHORIZED', 'WAIVED'].includes(row.careAuthorization.status)
                                }
                                onClick={() => void setStatus(row.id, 'CHECKED_IN')}
                              >
                                Marquer arrivé
                              </button>
                            )}
                          {scope === 'active' &&
                            canManageMoney &&
                            row.careAuthorization?.invoice &&
                            !['PAID', 'CANCELLED'].includes(
                              row.careAuthorization.invoice.status,
                            ) && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  void openPatientBilling(
                                    row.patient,
                                    'LIST',
                                    row.careAuthorization?.invoice?.id,
                                  )
                                }
                              >
                                <WalletCards size={15} /> Encaisser
                              </button>
                            )}
                          {scope === 'active' && canRecordVitals && (
                            <button
                              className="text-button"
                              onClick={() => {
                                setVitalAppointment(row);
                                setVitals(emptyVitals);
                              }}
                            >
                              <HeartPulse size={15} /> Signes vitaux
                            </button>
                          )}
                          {scope === 'active' &&
                            row.status === 'CHECKED_IN' &&
                            !row.doctorAcknowledgedAt &&
                            canManageAppointments && (
                              <button
                                className="text-button"
                                onClick={() => {
                                  setTransferring(row);
                                  setTransfer({ doctorId: '', reason: '' });
                                }}
                              >
                                <Send size={15} /> Renvoyer
                              </button>
                            )}
                          {scope === 'history' &&
                            row.status === 'CANCELLED' &&
                            !row.doctorAcknowledgedAt &&
                            canManageAppointments && (
                              <button
                                className="text-button"
                                onClick={() => {
                                  setTransferring(row);
                                  setTransfer({ doctorId: '', reason: '' });
                                }}
                              >
                                <Send size={15} /> Réorienter
                              </button>
                            )}
                          {scope === 'active' && canManageAppointments && (
                            <button
                              className="text-button danger"
                              disabled={submitting}
                              onClick={() => void setStatus(row.id, 'CANCELLED')}
                            >
                              Annuler
                            </button>
                          )}
                          {canManageAppointments && (
                            <CustomFieldsEditor entity="APPOINTMENT" entityId={row.id} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {doctorsOpen && (
        <Modal
          wide
          title="Disponibilité des médecins"
          eyebrow={`${doctorSummary.available} disponible(s) · ${doctorSummary.waiting} patient(s) en attente`}
          onClose={() => setDoctorsOpen(false)}
        >
          <div className="table-scroll">
            <table className="compact-table">
              <thead>
                <tr>
                  <th>Médecin</th>
                  <th>Spécialité</th>
                  <th>Présence</th>
                  <th>Disponibilité</th>
                  <th>Patient actuel</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doctor) => (
                  <tr key={doctor.id}>
                    <td>
                      <strong>{doctor.name}</strong>
                    </td>
                    <td>{doctor.specialty}</td>
                    <td>
                      {doctor.onDuty || doctor.attendanceStatus
                        ? doctor.attendanceStatus || 'Présent dans le service'
                        : 'Présence non confirmée'}
                    </td>
                    <td>
                      <StatusBadge status={doctor.availability} />
                    </td>
                    <td>
                      {doctor.availability === 'BUSY' && doctor.currentPatient
                        ? patientName(doctor.currentPatient)
                        : '—'}
                    </td>
                    <td>{doctor.waitingPatients.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="secondary-button" onClick={() => setDoctorsOpen(false)}>
              Fermer
            </button>
          </div>
        </Modal>
      )}

      {createOpen && (
        <Modal
          title={directReferral ? 'Transférer directement au médecin' : 'Planifier un rendez-vous'}
          eyebrow={directReferral ? 'Orientation immédiate' : 'Réception'}
          onClose={() => setCreateOpen(false)}
        >
          <form onSubmit={submit}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Patient"
                value={form.patientId}
                onChange={(patientId) => setForm({ ...form, patientId })}
                options={patients.map((patient) => ({
                  value: patient.id,
                  label: patientName(patient),
                  description: patient.medicalRecordNumber,
                }))}
              />
              {canManageMoney && selectedFormPatient && (
                <div
                  className={`alert full ${
                    appointmentFinancialSummary?.financialHold ||
                    appointmentFinancialSummary?.death.deceased
                      ? 'error'
                      : 'info'
                  }`}
                >
                  <strong>Situation financière du patient</strong>
                  <p>
                    {financialChecking
                      ? 'Vérification en cours…'
                      : appointmentFinancialSummary?.death.deceased
                        ? 'Ce patient est déclaré décédé : aucune nouvelle prise en charge ne peut être ouverte.'
                        : appointmentFinancialSummary?.financialHold
                          ? [
                              !appointmentFinancialSummary.file.active
                                ? 'fiche mensuelle inactive'
                                : '',
                              appointmentFinancialSummary.outstandingBalance > 0
                                ? `solde de ${currency(
                                    appointmentFinancialSummary.outstandingBalance,
                                  )} à régulariser`
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : appointmentFinancialSummary
                            ? 'Compte en ordre. La consultation sera facturée ici après la création du rendez-vous.'
                            : 'La vérification automatique est indisponible. Ouvrez la facturation avant de continuer.'}
                  </p>
                  {!appointmentFinancialSummary?.death.deceased && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={financialChecking}
                      onClick={() => void openPatientBilling(selectedFormPatient, 'FORM')}
                    >
                      <WalletCards size={16} /> Ouvrir la facturation ici
                    </button>
                  )}
                </div>
              )}
              <SearchableSelect
                required
                className="full"
                label="Médecin affecté"
                value={form.doctorId}
                onChange={(doctorId) => setForm({ ...form, doctorId })}
                options={doctors.map((doctor) => ({
                  value: doctor.id,
                  label: doctor.name,
                  description: `${doctor.specialty} · ${doctor.availability}`,
                }))}
              />
              {!directReferral && (
                <label className="field">
                  <span>Date et heure d’Isiro (UTC+2) *</span>
                  <input
                    required
                    type="datetime-local"
                    min={minimumScheduledAt}
                    value={form.scheduledAt}
                    onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })}
                  />
                  <small>Le premier créneau proposé est dans 15 minutes.</small>
                </label>
              )}
              <label className="field full">
                <span>Motif</span>
                <textarea
                  rows={3}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setCreateOpen(false)}
              >
                Annuler
              </button>
              <button
                className="primary-button"
                disabled={
                  submitting ||
                  Boolean(
                    canManageMoney &&
                    (appointmentFinancialSummary?.financialHold ||
                      appointmentFinancialSummary?.death.deceased),
                  )
                }
              >
                {directReferral
                  ? 'Transférer le dossier'
                  : canManageMoney
                    ? 'Enregistrer et préparer le paiement'
                    : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {billingOpen && billingPatient && (
        <Modal
          wide
          title="Facturation du patient"
          eyebrow={`${patientName(billingPatient)} · ${billingPatient.medicalRecordNumber}`}
          onClose={closePatientBilling}
        >
          {error && <div className="alert error">{error}</div>}
          {billingLoading ? (
            <div className="empty-state">
              <Activity className="spin" /> Vérification des factures…
            </div>
          ) : (
            <>
              {billingSummary && (
                <div className={`alert ${billingSummary.financialHold ? 'error' : 'info'}`}>
                  <strong>
                    {billingSummary.death.deceased
                      ? 'Patient déclaré décédé'
                      : billingSummary.financialHold
                        ? 'Paiement requis avant le rendez-vous'
                        : appointmentInvoiceId
                          ? 'Facture du rendez-vous prête à encaisser'
                          : 'Compte du patient en ordre'}
                  </strong>
                  <p>
                    Fiche mensuelle : {billingSummary.file.active ? 'active' : 'inactive'} · Solde
                    antérieur : {currency(billingSummary.outstandingBalance)}
                  </p>
                  {!billingSummary.death.deceased &&
                    !billingSummary.file.active &&
                    !billingSummary.file.pending && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={submitting}
                        onClick={() => void preparePatientFile()}
                      >
                        Préparer la fiche mensuelle (5 000 CDF)
                      </button>
                    )}
                </div>
              )}

              <div className="table-scroll">
                <table className="compact-table">
                  <thead>
                    <tr>
                      <th>Facture</th>
                      <th>Motif</th>
                      <th>Total</th>
                      <th>Reste patient</th>
                      <th>État</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingInvoices.filter(
                      (invoice) => !['PAID', 'CANCELLED'].includes(invoice.status),
                    ).length === 0 ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <WalletCards />
                            <strong>Aucune facture en attente</strong>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      billingInvoices
                        .filter((invoice) => !['PAID', 'CANCELLED'].includes(invoice.status))
                        .map((invoice) => (
                          <tr key={invoice.id}>
                            <td>
                              <strong>{invoice.number}</strong>
                            </td>
                            <td>{invoice.careAuthorization?.description ?? 'Facture patient'}</td>
                            <td>{currency(invoice.total)}</td>
                            <td>{currency(remainingForPayer(invoice, 'PATIENT'))}</td>
                            <td>
                              <StatusBadge status={invoice.status} />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => selectInvoiceForPayment(invoice)}
                              >
                                <WalletCards size={15} /> Encaisser
                              </button>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>

              {paying && (
                <form onSubmit={payInvoice}>
                  <div className="alert info">
                    Encaissement de <strong>{paying.number}</strong> · montant encore dû par le
                    payeur sélectionné : {currency(remainingForPayer(paying, payment.payerType))}
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Montant *</span>
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        max={remainingForPayer(paying, payment.payerType)}
                        value={payment.amount}
                        onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
                      />
                    </label>
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
                        {paying.voucherCoverage && (
                          <option value="SPONSOR">Organisme du bon</option>
                        )}
                      </select>
                    </label>
                    <label className="field full">
                      <span>Référence</span>
                      <input
                        value={payment.reference}
                        onChange={(event) =>
                          setPayment({ ...payment, reference: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setPaying(null)}
                    >
                      Choisir une autre facture
                    </button>
                    <button className="primary-button" disabled={submitting}>
                      Confirmer le paiement
                    </button>
                  </div>
                </form>
              )}

              {!paying && (
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={closePatientBilling}>
                    {billingOrigin === 'FORM' ? 'Retour au rendez-vous' : 'Fermer'}
                  </button>
                  {billingOrigin === 'FORM' && billingSummary && !billingSummary.financialHold && (
                    <button type="button" className="primary-button" onClick={closePatientBilling}>
                      Reprendre et créer le rendez-vous
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </Modal>
      )}

      {transferring && (
        <Modal
          title="Renvoyer vers un autre médecin"
          eyebrow={patientName(transferring.patient)}
          onClose={() => setTransferring(null)}
        >
          <form onSubmit={submitTransfer}>
            <div className="form-grid">
              <SearchableSelect
                required
                className="full"
                label="Nouveau médecin"
                value={transfer.doctorId}
                onChange={(doctorId) => setTransfer({ ...transfer, doctorId })}
                options={doctors
                  .filter((doctor) => doctor.id !== transferring.doctor?.id)
                  .map((doctor) => ({
                    value: doctor.id,
                    label: doctor.name,
                    description: `${doctor.specialty} · ${doctor.availability}`,
                  }))}
              />
              <label className="field full">
                <span>Motif du renvoi</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={transfer.reason}
                  onChange={(event) => setTransfer({ ...transfer, reason: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTransferring(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting || !transfer.doctorId}>
                Confirmer le renvoi
              </button>
            </div>
          </form>
        </Modal>
      )}

      {vitalAppointment && (
        <Modal
          title="Signes vitaux"
          eyebrow={patientName(vitalAppointment.patient)}
          onClose={() => setVitalAppointment(null)}
        >
          <form onSubmit={recordVitals}>
            <div className="form-grid">
              {vitalFields.map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    type="number"
                    step="any"
                    value={vitals[key]}
                    onChange={(event) => setVitals({ ...vitals, [key]: event.target.value })}
                  />
                </label>
              ))}
              <label className="field full">
                <span>Observations de réception</span>
                <textarea
                  rows={3}
                  value={vitals.notes}
                  onChange={(event) => setVitals({ ...vitals, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setVitalAppointment(null)}
              >
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer les signes vitaux
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal
          title={patientName(viewing.patient)}
          eyebrow={viewing.patient.medicalRecordNumber}
          onClose={() => setViewing(null)}
        >
          <div className="patient-journey-detail">
            <div>
              <strong>Rendez-vous</strong>
              <span>
                {new Intl.DateTimeFormat('fr-FR', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                }).format(new Date(viewing.scheduledAt))}
              </span>
            </div>
            <div>
              <strong>Service</strong>
              <span>{viewing.service}</span>
            </div>
            <div>
              <strong>Médecin</strong>
              <span>{viewing.doctor ? patientName(viewing.doctor) : 'Non assigné'}</span>
            </div>
            <div>
              <strong>Parcours</strong>
              <StatusBadge status={viewing.journeyStage} />
            </div>
            <div>
              <strong>Statut rendez-vous</strong>
              <StatusBadge status={viewing.status} />
            </div>
            <div>
              <strong>Paiement</strong>
              <StatusBadge status={viewing.careAuthorization?.status ?? 'PENDING'} />
            </div>
            {viewing.consultation?.examRequests?.length ? (
              <div className="full">
                <strong>Examens demandés</strong>
                <span>
                  {viewing.consultation.examRequests
                    .map((exam) => `${exam.type} (${exam.status})`)
                    .join(' · ')}
                </span>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}
