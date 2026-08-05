'use client';

import {
  Activity,
  AlertTriangle,
  BedDouble,
  DatabaseBackup,
  FlaskConical,
  Gauge,
  HardDrive,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Wrench,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Modal } from '@/components/modal';
import { SearchableSelect } from '@/components/searchable-select';
import { StatusBadge } from '@/components/status-badge';
import { api } from '@/lib/api';
import { currency, localDateTimeInputValue, patientName } from '@/lib/display';
import { notifyError, notifySuccess } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { Patient, User } from '@/lib/types';

type Tab = 'DASHBOARD' | 'CARE' | 'LAB' | 'QUALITY' | 'CONTINUITY';

interface QualityDashboard {
  generatedAt: string;
  waiting: { averageMinutes: number; waitingCount: number };
  doctorActivity: Array<{
    doctorId: string;
    lastName: string;
    postName?: string | null;
    firstName?: string | null;
    specialty: string;
    patientCount: number;
  }>;
  laboratory: { overdue: number; rejectedSpecimens: number; pendingValidation: number };
  medication: { overdue: number; critical: number };
  beds: { totalBeds: number; occupiedBeds: number; pendingCleaning: number; occupancyRate: number };
  mortality: { thirtyDays: number; today: number };
  receivables: { amount: number; invoiceCount: number };
  graces: { active: number; expiringSoon: number };
  stock: { lowStock: number; outOfStock: number; expiringLots: number };
  noShows: number;
  incidents: { open: number; critical: number };
}

interface BedBoardRow {
  roomId: string;
  roomCode: string;
  roomName: string;
  service?: string | null;
  bedId: string;
  bedCode: string;
  bedStatus: string;
  operationalStatus: string;
  hospitalizationId?: string | null;
  patientId?: string | null;
  medicalRecordNumber?: string | null;
  lastName?: string | null;
  postName?: string | null;
  firstName?: string | null;
  turnoverId?: string | null;
  turnoverStatus?: string | null;
  requestedAt?: string | null;
  cleanedAt?: string | null;
}

interface Handoff {
  id: string;
  patientId: string;
  hospitalizationId?: string | null;
  diagnosis?: string | null;
  currentCondition: string;
  treatmentsInProgress?: string | null;
  nextDoseAt?: string | null;
  pendingExams?: string | null;
  risks?: string | null;
  instructions: string;
  createdAt: string;
  acknowledgedAt?: string | null;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
  fromNurse: string;
  toNurse?: string | null;
}

interface MedicationAlert {
  id: string;
  patientId: string;
  label: string;
  medicationName?: string | null;
  dose?: string | null;
  route?: string | null;
  scheduledAt: string;
  status: string;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
  delayMinutes: number;
  alertLevel: string;
}

interface Exam {
  id: string;
  type: string;
  status: string;
  patient: Patient;
  catalogMetadata?: { specimenType?: string | null } | null;
}

interface Specimen {
  id: string;
  code: string;
  barcode: string;
  examRequestId: string;
  patientId: string;
  specimenType: string;
  status: string;
  rejectionReason?: string | null;
  notes?: string | null;
  createdAt: string;
  examType: string;
  medicalRecordNumber: string;
  lastName: string;
  postName?: string | null;
  firstName?: string | null;
}

interface Incident {
  id: string;
  reference: string;
  patientId?: string | null;
  category: string;
  severity: string;
  status: string;
  description: string;
  rootCause?: string | null;
  correctiveAction?: string | null;
  reportedAt: string;
  reportedBy: string;
  assignedTo?: string | null;
  medicalRecordNumber?: string | null;
  lastName?: string | null;
  postName?: string | null;
  firstName?: string | null;
}

interface Equipment {
  id: string;
  code: string;
  name: string;
  serialNumber?: string | null;
  department: string;
  status: string;
  nextMaintenanceAt?: string | null;
  assignedTechnician?: string | null;
  openMaintenanceCount: number;
}

interface Maintenance {
  id: string;
  equipmentId: string;
  type: string;
  status: string;
  description: string;
  cost?: number | null;
  reportedAt: string;
  equipmentCode: string;
  equipmentName: string;
  technician?: string | null;
}

interface SecuritySummary {
  loginEvents: { failed24h: number; successful24h: number; distinctFailedUsers: number };
  lockedUsers: Array<{
    id: string;
    username: string;
    role: string;
    failedAttempts: number;
    lockedUntil: string;
  }>;
  sessions: { active: number; expiringSoon: number };
  policy: {
    maximumFailedAttempts: number;
    lockDurationMinutes: number;
    recommendedIdleTimeoutMinutes: number;
    sensitiveRoles: string[];
  };
}

interface Session {
  id: string;
  userId: string;
  username: string;
  role: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  expiresAt: string;
  createdAt: string;
}

interface BackupRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt?: string | null;
  sizeBytes?: string | number | null;
  location?: string | null;
  checksum?: string | null;
  restoredTestAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
}

interface OfflineConflict {
  id: string;
  entityType: string;
  entityId?: string | null;
  localPayload: unknown;
  serverPayload?: unknown;
  status: string;
  resolution?: string | null;
  createdAt: string;
  username: string;
  role: string;
}

interface ContinuitySummary {
  lastSuccessfulBackupAt?: string | null;
  lastRestoreTestAt?: string | null;
  failedBackups30Days?: number;
  openSyncConflicts?: number;
  activeSessions?: number;
}

interface Hospitalization {
  id: string;
  patient: Patient;
  status: string;
}

const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '—';

const flatPatientName = (row: {
  lastName?: string | null;
  postName?: string | null;
  firstName?: string | null;
}) => [row.lastName, row.postName, row.firstName].filter(Boolean).join(' ');

const emptyHandoff = {
  patientId: '',
  hospitalizationId: '',
  toNurseId: '',
  diagnosis: '',
  currentCondition: '',
  treatmentsInProgress: '',
  nextDoseAt: '',
  pendingExams: '',
  risks: '',
  instructions: '',
};
const emptyIncident = { patientId: '', category: 'OTHER', severity: 'MEDIUM', description: '' };
const emptyEquipment = {
  code: '',
  name: '',
  serialNumber: '',
  department: '',
  acquiredAt: '',
  nextMaintenanceAt: '',
  assignedTechnicianId: '',
  notes: '',
};
const emptyMaintenance = {
  equipmentId: '',
  type: 'PREVENTIVE',
  description: '',
  technicianId: '',
  cost: '',
  notes: '',
};
const emptyBackup = {
  status: 'SUCCESS',
  startedAt: localDateTimeInputValue(),
  completedAt: localDateTimeInputValue(),
  sizeBytes: '',
  location: '',
  checksum: '',
  notes: '',
};

export default function QualityContinuityPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('DASHBOARD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [beds, setBeds] = useState<BedBoardRow[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [medicationAlerts, setMedicationAlerts] = useState<MedicationAlert[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [security, setSecurity] = useState<SecuritySummary | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [backups, setBackups] = useState<BackupRun[]>([]);
  const [conflicts, setConflicts] = useState<OfflineConflict[]>([]);
  const [continuity, setContinuity] = useState<ContinuitySummary | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [hospitalizations, setHospitalizations] = useState<Hospitalization[]>([]);
  const [handoffForm, setHandoffForm] = useState(emptyHandoff);
  const [incidentForm, setIncidentForm] = useState(emptyIncident);
  const [equipmentForm, setEquipmentForm] = useState(emptyEquipment);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenance);
  const [backupForm, setBackupForm] = useState(emptyBackup);
  const [specimenExamId, setSpecimenExamId] = useState('');
  const [specimenType, setSpecimenType] = useState('Sang');
  const [modal, setModal] = useState<
    'HANDOFF' | 'INCIDENT' | 'EQUIPMENT' | 'MAINTENANCE' | 'BACKUP' | null
  >(null);

  const isAdmin = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);
  const isNurse = hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'NURSE']);
  const canLab = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'NURSE',
    'LAB_TECHNICIAN',
    'MEDICAL_BIOLOGIST',
  ]);
  const canViewQuality = hasAnyRole(user, [
    'SUPER_ADMIN',
    'ADMIN',
    'DOCTOR',
    'NURSE',
    'ACCOUNTANT',
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const tasks: Promise<void>[] = [];
    const safely = <T,>(request: Promise<T>, apply: (value: T) => void) =>
      request.then(apply).catch(() => undefined);

    if (canViewQuality)
      tasks.push(safely(api<QualityDashboard>('/clinical-safety/quality/dashboard'), setDashboard));
    tasks.push(safely(api<BedBoardRow[]>('/clinical-safety/bed-board'), setBeds));
    tasks.push(safely(api<Handoff[]>('/clinical-safety/handoffs'), setHandoffs));
    tasks.push(
      safely(api<MedicationAlert[]>('/clinical-safety/medication-alerts'), setMedicationAlerts),
    );
    tasks.push(safely(api<Specimen[]>('/clinical-safety/specimens'), setSpecimens));
    tasks.push(safely(api<Exam[]>('/laboratory/exams'), setExams));
    tasks.push(safely(api<Incident[]>('/clinical-safety/incidents'), setIncidents));
    tasks.push(safely(api<Equipment[]>('/clinical-safety/equipment'), setEquipment));
    tasks.push(
      safely(api<{ items: Patient[] }>('/patients/lookup?limit=250'), (value) =>
        setPatients(value.items),
      ),
    );
    tasks.push(safely(api<User[]>('/users'), setUsers));
    tasks.push(
      safely(api<Hospitalization[]>('/hospitalizations?status=ACTIVE'), setHospitalizations),
    );
    if (isAdmin) {
      tasks.push(safely(api<Maintenance[]>('/clinical-safety/maintenance'), setMaintenance));
      tasks.push(safely(api<SecuritySummary>('/clinical-safety/security/summary'), setSecurity));
      tasks.push(safely(api<Session[]>('/clinical-safety/security/sessions'), setSessions));
      tasks.push(safely(api<BackupRun[]>('/clinical-safety/backups'), setBackups));
      tasks.push(
        safely(api<OfflineConflict[]>('/clinical-safety/offline-conflicts'), setConflicts),
      );
      tasks.push(
        safely(api<ContinuitySummary>('/clinical-safety/continuity/summary'), setContinuity),
      );
    }
    try {
      await Promise.all(tasks);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chargement incomplet.');
    } finally {
      setLoading(false);
    }
  }, [canViewQuality, isAdmin]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const nurses = useMemo(
    () =>
      users.filter((entry) => entry.role === 'NURSE' || entry.additionalRoles?.includes('NURSE')),
    [users],
  );
  const pendingSpecimenExams = useMemo(
    () =>
      exams.filter(
        (exam) =>
          !specimens.some((specimen) => specimen.examRequestId === exam.id) &&
          ['REQUESTED', 'IN_PROGRESS'].includes(exam.status),
      ),
    [exams, specimens],
  );

  const action = async (request: Promise<unknown>, message: string) => {
    setSubmitting(true);
    try {
      await request;
      notifySuccess(message);
      setModal(null);
      await load();
    } catch (reason) {
      notifyError(reason instanceof Error ? reason.message : 'Action impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateTurnover = (row: BedBoardRow, status: 'CLEANING' | 'READY') => {
    if (!row.turnoverId) return;
    void action(
      api(`/clinical-safety/bed-turnovers/${row.turnoverId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
      status === 'READY' ? 'Le lit est propre et disponible.' : 'Le nettoyage du lit a commencé.',
    );
  };

  const acknowledgeHandoff = (id: string) =>
    void action(
      api(`/clinical-safety/handoffs/${id}/acknowledge`, { method: 'PATCH' }),
      'La relève a été prise en compte.',
    );

  const createHandoff = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api(`/clinical-safety/patients/${handoffForm.patientId}/handoffs`, {
        method: 'POST',
        body: JSON.stringify({
          ...handoffForm,
          hospitalizationId: handoffForm.hospitalizationId || undefined,
          toNurseId: handoffForm.toNurseId || undefined,
          diagnosis: handoffForm.diagnosis || undefined,
          treatmentsInProgress: handoffForm.treatmentsInProgress || undefined,
          nextDoseAt: handoffForm.nextDoseAt
            ? new Date(handoffForm.nextDoseAt).toISOString()
            : undefined,
          pendingExams: handoffForm.pendingExams || undefined,
          risks: handoffForm.risks || undefined,
        }),
      }),
      'La relève infirmière a été créée et transmise.',
    );
  };

  const createSpecimen = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api('/clinical-safety/specimens', {
        method: 'POST',
        body: JSON.stringify({ examRequestId: specimenExamId, specimenType }),
      }),
      'Le prélèvement a été créé avec son code-barres.',
    );
  };

  const updateSpecimen = (row: Specimen, status: string) => {
    const rejectionReason =
      status === 'REJECTED' ? window.prompt('Motif obligatoire du rejet :')?.trim() : undefined;
    if (status === 'REJECTED' && !rejectionReason) return;
    void action(
      api(`/clinical-safety/specimens/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rejectionReason }),
      }),
      `Le prélèvement ${row.code} est maintenant ${status}.`,
    );
  };

  const createIncident = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api('/clinical-safety/incidents', {
        method: 'POST',
        body: JSON.stringify({ ...incidentForm, patientId: incidentForm.patientId || undefined }),
      }),
      'L’incident a été déclaré et ajouté au registre qualité.',
    );
  };

  const updateIncident = (row: Incident, status: string) => {
    const rootCause = status === 'CLOSED' ? window.prompt('Cause racine :')?.trim() : undefined;
    const correctiveAction =
      status === 'CLOSED' ? window.prompt('Action corrective :')?.trim() : undefined;
    if (status === 'CLOSED' && (!rootCause || !correctiveAction)) return;
    void action(
      api(`/clinical-safety/incidents/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, rootCause, correctiveAction }),
      }),
      status === 'CLOSED'
        ? 'L’incident est clôturé avec son action corrective.'
        : 'Le statut de l’incident a été mis à jour.',
    );
  };

  const createEquipment = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api('/clinical-safety/equipment', {
        method: 'POST',
        body: JSON.stringify({
          ...equipmentForm,
          serialNumber: equipmentForm.serialNumber || undefined,
          acquiredAt: equipmentForm.acquiredAt || undefined,
          nextMaintenanceAt: equipmentForm.nextMaintenanceAt || undefined,
          assignedTechnicianId: equipmentForm.assignedTechnicianId || undefined,
          notes: equipmentForm.notes || undefined,
        }),
      }),
      'L’équipement biomédical a été enregistré.',
    );
  };

  const createMaintenance = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api(`/clinical-safety/equipment/${maintenanceForm.equipmentId}/maintenance`, {
        method: 'POST',
        body: JSON.stringify({
          type: maintenanceForm.type,
          description: maintenanceForm.description,
          technicianId: maintenanceForm.technicianId || undefined,
          cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : undefined,
          notes: maintenanceForm.notes || undefined,
        }),
      }),
      'La maintenance a été ouverte.',
    );
  };

  const registerBackup = (event: FormEvent) => {
    event.preventDefault();
    void action(
      api('/clinical-safety/backups', {
        method: 'POST',
        body: JSON.stringify({
          ...backupForm,
          startedAt: new Date(backupForm.startedAt).toISOString(),
          completedAt: backupForm.completedAt
            ? new Date(backupForm.completedAt).toISOString()
            : undefined,
          sizeBytes: backupForm.sizeBytes ? Number(backupForm.sizeBytes) : undefined,
          location: backupForm.location || undefined,
          checksum: backupForm.checksum || undefined,
          notes: backupForm.notes || undefined,
        }),
      }),
      'L’exécution de sauvegarde a été enregistrée.',
    );
  };

  const resolveConflict = (row: OfflineConflict, status: 'RESOLVED' | 'DISCARDED') => {
    const resolution = window.prompt('Décrivez la décision de résolution :')?.trim();
    if (!resolution) return;
    void action(
      api(`/clinical-safety/offline-conflicts/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, resolution }),
      }),
      'Le conflit de synchronisation a été traité.',
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Pilotage hospitalier et sécurité opérationnelle</span>
          <h1>Qualité & continuité</h1>
          <p>
            Supervision des délais, lits, traitements, prélèvements, incidents, équipements,
            connexions, sauvegardes et conflits hors ligne.
          </p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={17} /> Actualiser
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && (
        <div className="empty-state">
          <Activity className="spin" /> Actualisation du centre de contrôle…
        </div>
      )}

      <nav className="quality-tabs">
        {(
          [
            ['DASHBOARD', 'Indicateurs'],
            ['CARE', 'Lits & relèves'],
            ['LAB', 'Laboratoire & doses'],
            ['QUALITY', 'Incidents & équipements'],
            ['CONTINUITY', 'Sécurité & sauvegardes'],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'DASHBOARD' && (
        <>
          <section className="quality-metric-grid">
            <article className="panel quality-metric">
              <span>Attente moyenne</span>
              <strong>{dashboard?.waiting.averageMinutes ?? 0} min</strong>
              <small>{dashboard?.waiting.waitingCount ?? 0} patient(s)</small>
            </article>
            <article className="panel quality-metric">
              <span>Occupation des lits</span>
              <strong>{dashboard?.beds.occupancyRate ?? 0}%</strong>
              <small>
                {dashboard?.beds.occupiedBeds ?? 0}/{dashboard?.beds.totalBeds ?? 0} occupés
              </small>
            </article>
            <article className="panel quality-metric quality-warning">
              <span>Doses en retard</span>
              <strong>{dashboard?.medication.overdue ?? 0}</strong>
              <small>{dashboard?.medication.critical ?? 0} critique(s)</small>
            </article>
            <article className="panel quality-metric quality-warning">
              <span>Laboratoire en retard</span>
              <strong>{dashboard?.laboratory.overdue ?? 0}</strong>
              <small>{dashboard?.laboratory.pendingValidation ?? 0} à valider</small>
            </article>
            <article className="panel quality-metric">
              <span>Créances patients</span>
              <strong>{currency(dashboard?.receivables.amount ?? 0)}</strong>
              <small>{dashboard?.receivables.invoiceCount ?? 0} facture(s)</small>
            </article>
            <article className="panel quality-metric">
              <span>Mesures de grâce</span>
              <strong>{dashboard?.graces.active ?? 0}</strong>
              <small>{dashboard?.graces.expiringSoon ?? 0} bientôt expirée(s)</small>
            </article>
            <article className="panel quality-metric quality-warning">
              <span>Stock critique</span>
              <strong>{dashboard?.stock.outOfStock ?? 0}</strong>
              <small>{dashboard?.stock.lowStock ?? 0} stock(s) bas</small>
            </article>
            <article className="panel quality-metric quality-urgent">
              <span>Incidents ouverts</span>
              <strong>{dashboard?.incidents.open ?? 0}</strong>
              <small>{dashboard?.incidents.critical ?? 0} critique(s)</small>
            </article>
          </section>
          <section className="quality-layout">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Activité médicale du jour</span>
                  <h2>Patients par médecin</h2>
                </div>
                <Stethoscope />
              </div>
              <div className="quality-list">
                {dashboard?.doctorActivity.map((row) => (
                  <div className="quality-list-item" key={row.doctorId}>
                    <div>
                      <strong>{flatPatientName(row)}</strong>
                      <small>{row.specialty}</small>
                    </div>
                    <strong>{row.patientCount}</strong>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Risques à surveiller</span>
                  <h2>Alertes institutionnelles</h2>
                </div>
                <Gauge />
              </div>
              <div className="quality-list">
                <div className="quality-list-item">
                  <div>
                    <strong>Prélèvements rejetés</strong>
                    <small>À analyser avec le laboratoire</small>
                  </div>
                  <strong>{dashboard?.laboratory.rejectedSpecimens ?? 0}</strong>
                </div>
                <div className="quality-list-item">
                  <div>
                    <strong>Lits à nettoyer</strong>
                    <small>Indisponibles jusqu’à validation</small>
                  </div>
                  <strong>{dashboard?.beds.pendingCleaning ?? 0}</strong>
                </div>
                <div className="quality-list-item">
                  <div>
                    <strong>Rendez-vous non honorés</strong>
                    <small>Sur les 30 derniers jours</small>
                  </div>
                  <strong>{dashboard?.noShows ?? 0}</strong>
                </div>
                <div className="quality-list-item">
                  <div>
                    <strong>Décès sur 30 jours</strong>
                    <small>{dashboard?.mortality.today ?? 0} aujourd’hui</small>
                  </div>
                  <strong>{dashboard?.mortality.thirtyDays ?? 0}</strong>
                </div>
              </div>
            </article>
          </section>
        </>
      )}

      {tab === 'CARE' && (
        <section className="quality-layout">
          <article className="panel full-span">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Disponibilité réelle</span>
                <h2>Tableau des lits</h2>
              </div>
              <BedDouble />
            </div>
            <div className="quality-bed-grid">
              {beds.map((row) => (
                <div
                  className={`quality-bed-card status-${row.operationalStatus.toLowerCase()}`}
                  key={row.bedId}
                >
                  <strong>
                    {row.roomCode} · lit {row.bedCode}
                  </strong>
                  <span>
                    {row.roomName}
                    {row.service ? ` · ${row.service}` : ''}
                  </span>
                  <StatusBadge status={row.operationalStatus} />
                  {row.patientId && (
                    <small>
                      {flatPatientName(row)} · {row.medicalRecordNumber}
                    </small>
                  )}
                  {row.turnoverId &&
                    ['PENDING_CLEANING', 'CLEANING'].includes(row.turnoverStatus ?? '') && (
                      <div className="row-actions">
                        {row.turnoverStatus === 'PENDING_CLEANING' && (
                          <button
                            className="text-button"
                            onClick={() => updateTurnover(row, 'CLEANING')}
                          >
                            Commencer
                          </button>
                        )}
                        <button
                          className="text-button"
                          onClick={() => updateTurnover(row, 'READY')}
                        >
                          Confirmer propre
                        </button>
                      </div>
                    )}
                </div>
              ))}
            </div>
          </article>
          <article className="panel full-span">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Transmission entre équipes</span>
                <h2>Relèves infirmières</h2>
              </div>
              {isNurse && (
                <button
                  className="primary-button compact"
                  onClick={() => {
                    setHandoffForm(emptyHandoff);
                    setModal('HANDOFF');
                  }}
                >
                  <Plus size={16} /> Nouvelle relève
                </button>
              )}
            </div>
            <div className="quality-list">
              {handoffs.map((row) => (
                <div className="quality-list-item" key={row.id}>
                  <div>
                    <strong>
                      {flatPatientName(row)} · {row.medicalRecordNumber}
                    </strong>
                    <span>{row.currentCondition}</span>
                    <small>
                      {row.instructions} · de {row.fromNurse} vers{' '}
                      {row.toNurse || 'équipe disponible'} · {dateTime(row.createdAt)}
                    </small>
                  </div>
                  {row.acknowledgedAt ? (
                    <StatusBadge status="ACKNOWLEDGED" />
                  ) : (
                    <button
                      className="primary-button compact"
                      onClick={() => acknowledgeHandoff(row.id)}
                    >
                      Prendre connaissance
                    </button>
                  )}
                </div>
              ))}
              {!handoffs.length && <div className="empty-state">Aucune relève enregistrée.</div>}
            </div>
          </article>
        </section>
      )}

      {tab === 'LAB' && (
        <section className="quality-layout">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Administration des traitements</span>
                <h2>Doses proches ou en retard</h2>
              </div>
              <Syringe />
            </div>
            <div className="quality-list">
              {medicationAlerts.map((row) => (
                <div
                  className={`quality-list-item ${row.alertLevel === 'CRITICAL_LATE' ? 'quality-urgent' : row.alertLevel === 'LATE' ? 'quality-warning' : ''}`}
                  key={row.id}
                >
                  <div>
                    <strong>
                      {flatPatientName(row)} · {row.medicalRecordNumber}
                    </strong>
                    <span>
                      {row.medicationName || row.label} · {row.dose || 'dose non précisée'} ·{' '}
                      {row.route || 'voie non précisée'}
                    </span>
                    <small>
                      Prévu : {dateTime(row.scheduledAt)} · retard {row.delayMinutes} min
                    </small>
                  </div>
                  <StatusBadge status={row.alertLevel} />
                </div>
              ))}
              {!medicationAlerts.length && <div className="empty-state">Aucune dose urgente.</div>}
            </div>
          </article>
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Nouveau prélèvement</span>
                <h2>Étiquette et code-barres</h2>
              </div>
              <FlaskConical />
            </div>
            {canLab ? (
              <form onSubmit={createSpecimen}>
                <div className="form-grid">
                  <SearchableSelect
                    required
                    label="Examen sans prélèvement"
                    value={specimenExamId}
                    onChange={(value) => {
                      setSpecimenExamId(value);
                      const exam = pendingSpecimenExams.find((row) => row.id === value);
                      setSpecimenType(exam?.catalogMetadata?.specimenType || 'Sang');
                    }}
                    options={pendingSpecimenExams.map((row) => ({
                      value: row.id,
                      label: row.type,
                      description: `${patientName(row.patient)} · ${row.patient.medicalRecordNumber}`,
                    }))}
                  />
                  <label className="field">
                    <span>Type d’échantillon *</span>
                    <input
                      required
                      value={specimenType}
                      onChange={(event) => setSpecimenType(event.target.value)}
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="primary-button" disabled={submitting || !specimenExamId}>
                    <Plus size={16} /> Créer le prélèvement
                  </button>
                </div>
              </form>
            ) : (
              <div className="empty-state">Rôle laboratoire ou infirmier requis.</div>
            )}
          </article>
          <article className="panel full-span">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Chaîne de traçabilité</span>
                <h2>Prélèvements</h2>
              </div>
              <FlaskConical />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Patient</th>
                    <th>Examen</th>
                    <th>Échantillon</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {specimens.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.code}</strong>
                        <br />
                        <span className="quality-code">{row.barcode}</span>
                      </td>
                      <td>
                        {flatPatientName(row)}
                        <br />
                        <span className="muted">{row.medicalRecordNumber}</span>
                      </td>
                      <td>{row.examType}</td>
                      <td>
                        {row.specimenType}
                        {row.rejectionReason && (
                          <>
                            <br />
                            <strong>{row.rejectionReason}</strong>
                          </>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {row.status === 'ORDERED' && (
                            <button
                              className="text-button"
                              onClick={() => updateSpecimen(row, 'COLLECTED')}
                            >
                              Prélevé
                            </button>
                          )}
                          {row.status === 'COLLECTED' && (
                            <button
                              className="text-button"
                              onClick={() => updateSpecimen(row, 'RECEIVED')}
                            >
                              Reçu
                            </button>
                          )}
                          {row.status === 'RECEIVED' && (
                            <button
                              className="text-button"
                              onClick={() => updateSpecimen(row, 'IN_ANALYSIS')}
                            >
                              Analyser
                            </button>
                          )}
                          {row.status === 'IN_ANALYSIS' && (
                            <button
                              className="text-button"
                              onClick={() => updateSpecimen(row, 'COMPLETED')}
                            >
                              Terminer
                            </button>
                          )}
                          {!['REJECTED', 'COMPLETED'].includes(row.status) && (
                            <button
                              className="text-button danger"
                              onClick={() => updateSpecimen(row, 'REJECTED')}
                            >
                              Rejeter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {tab === 'QUALITY' && (
        <section className="quality-layout">
          <article className="panel full-span">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Déclaration et action corrective</span>
                <h2>Incidents cliniques</h2>
              </div>
              <button
                className="primary-button compact"
                onClick={() => {
                  setIncidentForm(emptyIncident);
                  setModal('INCIDENT');
                }}
              >
                <Plus size={16} /> Déclarer
              </button>
            </div>
            <div className="quality-list">
              {incidents.map((row) => (
                <div
                  className={`quality-list-item ${row.severity === 'CRITICAL' ? 'quality-urgent' : row.severity === 'HIGH' ? 'quality-warning' : ''}`}
                  key={row.id}
                >
                  <div>
                    <strong>
                      {row.reference} · {row.category}
                    </strong>
                    <span>{row.description}</span>
                    <small>
                      {row.patientId
                        ? `${flatPatientName(row)} · ${row.medicalRecordNumber} · `
                        : ''}
                      déclaré par {row.reportedBy} le {dateTime(row.reportedAt)}
                    </small>
                  </div>
                  <div className="row-actions">
                    <StatusBadge status={row.severity} />
                    <StatusBadge status={row.status} />
                    {isAdmin && row.status !== 'CLOSED' && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => updateIncident(row, 'IN_REVIEW')}
                        >
                          Analyser
                        </button>
                        <button
                          className="text-button"
                          onClick={() => updateIncident(row, 'ACTION_REQUIRED')}
                        >
                          Action requise
                        </button>
                        <button
                          className="text-button"
                          onClick={() => updateIncident(row, 'CLOSED')}
                        >
                          Clôturer
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
          <article className="panel full-span">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Parc biomédical</span>
                <h2>Équipements et maintenances</h2>
              </div>
              <div className="row-actions">
                {isAdmin && (
                  <button
                    className="secondary-button compact"
                    onClick={() => {
                      setEquipmentForm(emptyEquipment);
                      setModal('EQUIPMENT');
                    }}
                  >
                    <Plus size={16} /> Équipement
                  </button>
                )}
                <button
                  className="primary-button compact"
                  onClick={() => {
                    setMaintenanceForm(emptyMaintenance);
                    setModal('MAINTENANCE');
                  }}
                >
                  <Wrench size={16} /> Maintenance
                </button>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Équipement</th>
                    <th>Service</th>
                    <th>Statut</th>
                    <th>Maintenance</th>
                  </tr>
                </thead>
                <tbody>
                  {equipment.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.code}
                        <br />
                        <span className="muted">{row.serialNumber || 'sans série'}</span>
                      </td>
                      <td>
                        <strong>{row.name}</strong>
                      </td>
                      <td>{row.department}</td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        {dateTime(row.nextMaintenanceAt)}
                        <br />
                        <span className="muted">{row.openMaintenanceCount} ouverte(s)</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin && maintenance.length > 0 && (
              <div className="quality-list">
                {maintenance.slice(0, 12).map((row) => (
                  <div className="quality-list-item" key={row.id}>
                    <div>
                      <strong>
                        {row.equipmentCode} · {row.equipmentName}
                      </strong>
                      <span>
                        {row.type} · {row.description}
                      </span>
                      <small>
                        {row.technician || 'Technicien à affecter'} · {dateTime(row.reportedAt)}
                      </small>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      )}

      {tab === 'CONTINUITY' &&
        (isAdmin ? (
          <section className="quality-layout">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Protection des comptes</span>
                  <h2>Sécurité des connexions</h2>
                </div>
                <KeyRound />
              </div>
              <div className="quality-metric-grid">
                <div className="quality-metric">
                  <span>Connexions réussies 24 h</span>
                  <strong>{security?.loginEvents.successful24h ?? 0}</strong>
                </div>
                <div className="quality-metric">
                  <span>Échecs 24 h</span>
                  <strong>{security?.loginEvents.failed24h ?? 0}</strong>
                </div>
                <div className="quality-metric">
                  <span>Sessions actives</span>
                  <strong>{security?.sessions.active ?? 0}</strong>
                </div>
                <div className="quality-metric">
                  <span>Comptes verrouillés</span>
                  <strong>{security?.lockedUsers.length ?? 0}</strong>
                </div>
              </div>
              <div className="quality-list">
                {sessions.slice(0, 20).map((row) => (
                  <div className="quality-list-item" key={row.id}>
                    <div>
                      <strong>
                        {row.username} · {row.role}
                      </strong>
                      <span>
                        {row.ipAddress || 'IP inconnue'} · {row.userAgent || 'Appareil inconnu'}
                      </span>
                      <small>Expire : {dateTime(row.expiresAt)}</small>
                    </div>
                    <button
                      className="text-button danger"
                      onClick={() =>
                        void action(
                          api(`/clinical-safety/security/sessions/${row.id}/revoke`, {
                            method: 'PATCH',
                          }),
                          'La session a été révoquée.',
                        )
                      }
                    >
                      Révoquer
                    </button>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Reprise après incident</span>
                  <h2>Sauvegardes</h2>
                </div>
                <button
                  className="primary-button compact"
                  onClick={() => {
                    setBackupForm(emptyBackup);
                    setModal('BACKUP');
                  }}
                >
                  <DatabaseBackup size={16} /> Enregistrer
                </button>
              </div>
              <div className="quality-list">
                {backups.slice(0, 20).map((row) => (
                  <div className="quality-list-item" key={row.id}>
                    <div>
                      <strong>
                        {row.status} · {row.location || 'emplacement non renseigné'}
                      </strong>
                      <span>
                        {row.sizeBytes
                          ? `${Number(row.sizeBytes).toLocaleString('fr-FR')} octets`
                          : 'taille inconnue'}{' '}
                        · {row.checksum || 'checksum absent'}
                      </span>
                      <small>
                        {dateTime(row.startedAt)} · restauration testée :{' '}
                        {dateTime(row.restoredTestAt)}
                      </small>
                    </div>
                    {row.status !== 'RESTORED_TESTED' && (
                      <button
                        className="text-button"
                        onClick={() =>
                          void action(
                            api(`/clinical-safety/backups/${row.id}/restored`, {
                              method: 'PATCH',
                              body: JSON.stringify({
                                notes: 'Restauration vérifiée depuis le centre qualité.',
                              }),
                            }),
                            'La restauration testée est enregistrée.',
                          )
                        }
                      >
                        Marquer restaurée
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </article>
            <article className="panel full-span">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Synchronisation hors ligne</span>
                  <h2>Conflits à résoudre</h2>
                </div>
                <HardDrive />
              </div>
              <div className="quality-metric-grid">
                <div className="quality-metric">
                  <span>Dernière sauvegarde réussie</span>
                  <strong>{dateTime(continuity?.lastSuccessfulBackupAt)}</strong>
                </div>
                <div className="quality-metric">
                  <span>Dernière restauration testée</span>
                  <strong>{dateTime(continuity?.lastRestoreTestAt)}</strong>
                </div>
                <div className="quality-metric">
                  <span>Échecs de sauvegarde / 30 j</span>
                  <strong>{continuity?.failedBackups30Days ?? 0}</strong>
                </div>
                <div className="quality-metric">
                  <span>Conflits ouverts</span>
                  <strong>{continuity?.openSyncConflicts ?? 0}</strong>
                </div>
              </div>
              <div className="quality-list">
                {conflicts.map((row) => (
                  <div className="quality-list-item" key={row.id}>
                    <div>
                      <strong>
                        {row.entityType} · {row.entityId || 'nouvel élément'}
                      </strong>
                      <span>
                        {row.username} · {row.role} · {dateTime(row.createdAt)}
                      </span>
                      <pre className="quality-json">
                        {JSON.stringify(
                          { local: row.localPayload, server: row.serverPayload },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                    <div className="row-actions">
                      <StatusBadge status={row.status} />
                      {row.status === 'OPEN' && (
                        <>
                          <button
                            className="text-button"
                            onClick={() => resolveConflict(row, 'RESOLVED')}
                          >
                            Fusionner
                          </button>
                          <button
                            className="text-button danger"
                            onClick={() => resolveConflict(row, 'DISCARDED')}
                          >
                            Écarter
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : (
          <div className="alert info">
            <ShieldCheck size={18} /> La sécurité des sessions, les sauvegardes et les conflits sont
            réservés à l’administration.
          </div>
        ))}

      {modal === 'HANDOFF' && (
        <Modal
          title="Créer une relève infirmière"
          eyebrow="Transmission structurée entre équipes"
          onClose={() => setModal(null)}
        >
          <form onSubmit={createHandoff}>
            <div className="form-grid">
              <SearchableSelect
                required
                label="Patient"
                value={handoffForm.patientId}
                onChange={(value) =>
                  setHandoffForm({
                    ...handoffForm,
                    patientId: value,
                    hospitalizationId:
                      hospitalizations.find((stay) => stay.patient.id === value)?.id ?? '',
                  })
                }
                options={patients.map((row) => ({
                  value: row.id,
                  label: patientName(row),
                  description: row.medicalRecordNumber,
                }))}
              />
              <SearchableSelect
                label="Infirmier destinataire"
                value={handoffForm.toNurseId}
                onChange={(value) => setHandoffForm({ ...handoffForm, toNurseId: value })}
                options={nurses.map((row) => ({
                  value: row.id,
                  label: row.username,
                  description: 'Infirmier',
                }))}
              />
              <label className="field full">
                <span>État actuel *</span>
                <textarea
                  required
                  value={handoffForm.currentCondition}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, currentCondition: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Diagnostic</span>
                <input
                  value={handoffForm.diagnosis}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, diagnosis: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Traitements en cours</span>
                <textarea
                  value={handoffForm.treatmentsInProgress}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, treatmentsInProgress: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Prochaine dose</span>
                <input
                  type="datetime-local"
                  value={handoffForm.nextDoseAt}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, nextDoseAt: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Examens attendus</span>
                <input
                  value={handoffForm.pendingExams}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, pendingExams: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Risques</span>
                <textarea
                  value={handoffForm.risks}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, risks: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Consignes *</span>
                <textarea
                  required
                  value={handoffForm.instructions}
                  onChange={(event) =>
                    setHandoffForm({ ...handoffForm, instructions: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Transmettre la relève
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'INCIDENT' && (
        <Modal
          title="Déclarer un incident"
          eyebrow="Qualité et sécurité des soins"
          onClose={() => setModal(null)}
        >
          <form onSubmit={createIncident}>
            <div className="form-grid">
              <SearchableSelect
                label="Patient concerné"
                value={incidentForm.patientId}
                onChange={(value) => setIncidentForm({ ...incidentForm, patientId: value })}
                options={patients.map((row) => ({
                  value: row.id,
                  label: patientName(row),
                  description: row.medicalRecordNumber,
                }))}
              />
              <label className="field">
                <span>Catégorie *</span>
                <select
                  value={incidentForm.category}
                  onChange={(event) =>
                    setIncidentForm({ ...incidentForm, category: event.target.value })
                  }
                >
                  <option value="MEDICATION_ERROR">Erreur médicamenteuse</option>
                  <option value="FALL">Chute</option>
                  <option value="TRANSFUSION">Transfusion</option>
                  <option value="LABORATORY">Laboratoire</option>
                  <option value="BILLING">Facturation</option>
                  <option value="EQUIPMENT">Équipement</option>
                  <option value="SECURITY">Sécurité</option>
                  <option value="OTHER">Autre</option>
                </select>
              </label>
              <label className="field">
                <span>Gravité *</span>
                <select
                  value={incidentForm.severity}
                  onChange={(event) =>
                    setIncidentForm({ ...incidentForm, severity: event.target.value })
                  }
                >
                  <option value="LOW">Faible</option>
                  <option value="MEDIUM">Moyenne</option>
                  <option value="HIGH">Élevée</option>
                  <option value="CRITICAL">Critique</option>
                </select>
              </label>
              <label className="field full">
                <span>Description *</span>
                <textarea
                  required
                  minLength={10}
                  rows={5}
                  value={incidentForm.description}
                  onChange={(event) =>
                    setIncidentForm({ ...incidentForm, description: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                <AlertTriangle size={16} /> Déclarer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'EQUIPMENT' && (
        <Modal
          title="Ajouter un équipement biomédical"
          eyebrow="Inventaire et maintenance"
          onClose={() => setModal(null)}
        >
          <form onSubmit={createEquipment}>
            <div className="form-grid">
              <label className="field">
                <span>Code *</span>
                <input
                  required
                  value={equipmentForm.code}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, code: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Nom *</span>
                <input
                  required
                  value={equipmentForm.name}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Numéro de série</span>
                <input
                  value={equipmentForm.serialNumber}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, serialNumber: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Service *</span>
                <input
                  required
                  value={equipmentForm.department}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, department: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Date d’acquisition</span>
                <input
                  type="date"
                  value={equipmentForm.acquiredAt}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, acquiredAt: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Prochaine maintenance</span>
                <input
                  type="date"
                  value={equipmentForm.nextMaintenanceAt}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, nextMaintenanceAt: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Notes</span>
                <textarea
                  value={equipmentForm.notes}
                  onChange={(event) =>
                    setEquipmentForm({ ...equipmentForm, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'MAINTENANCE' && (
        <Modal
          title="Ouvrir une maintenance"
          eyebrow="Préventive ou corrective"
          onClose={() => setModal(null)}
        >
          <form onSubmit={createMaintenance}>
            <div className="form-grid">
              <SearchableSelect
                required
                label="Équipement"
                value={maintenanceForm.equipmentId}
                onChange={(value) => setMaintenanceForm({ ...maintenanceForm, equipmentId: value })}
                options={equipment.map((row) => ({
                  value: row.id,
                  label: `${row.code} · ${row.name}`,
                  description: row.department,
                }))}
              />
              <label className="field">
                <span>Type *</span>
                <select
                  value={maintenanceForm.type}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, type: event.target.value })
                  }
                >
                  <option value="PREVENTIVE">Préventive</option>
                  <option value="CORRECTIVE">Corrective</option>
                </select>
              </label>
              <label className="field full">
                <span>Description *</span>
                <textarea
                  required
                  minLength={5}
                  value={maintenanceForm.description}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, description: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Coût estimé</span>
                <input
                  type="number"
                  min="0"
                  value={maintenanceForm.cost}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, cost: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Notes</span>
                <textarea
                  value={maintenanceForm.notes}
                  onChange={(event) =>
                    setMaintenanceForm({ ...maintenanceForm, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Ouvrir la maintenance
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'BACKUP' && (
        <Modal
          title="Enregistrer une sauvegarde"
          eyebrow="Preuve et contrôle de restauration"
          onClose={() => setModal(null)}
        >
          <form onSubmit={registerBackup}>
            <div className="form-grid">
              <label className="field">
                <span>Statut *</span>
                <select
                  value={backupForm.status}
                  onChange={(event) => setBackupForm({ ...backupForm, status: event.target.value })}
                >
                  <option value="SUCCESS">Réussie</option>
                  <option value="FAILED">Échouée</option>
                  <option value="RUNNING">En cours</option>
                </select>
              </label>
              <label className="field">
                <span>Début *</span>
                <input
                  required
                  type="datetime-local"
                  value={backupForm.startedAt}
                  onChange={(event) =>
                    setBackupForm({ ...backupForm, startedAt: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Fin</span>
                <input
                  type="datetime-local"
                  value={backupForm.completedAt}
                  onChange={(event) =>
                    setBackupForm({ ...backupForm, completedAt: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Taille en octets</span>
                <input
                  type="number"
                  min="0"
                  value={backupForm.sizeBytes}
                  onChange={(event) =>
                    setBackupForm({ ...backupForm, sizeBytes: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Emplacement</span>
                <input
                  value={backupForm.location}
                  onChange={(event) =>
                    setBackupForm({ ...backupForm, location: event.target.value })
                  }
                  placeholder="Ex. stockage externe / sauvegardes/2026-07-25"
                />
              </label>
              <label className="field full">
                <span>Somme de contrôle</span>
                <input
                  value={backupForm.checksum}
                  onChange={(event) =>
                    setBackupForm({ ...backupForm, checksum: event.target.value })
                  }
                />
              </label>
              <label className="field full">
                <span>Notes</span>
                <textarea
                  value={backupForm.notes}
                  onChange={(event) => setBackupForm({ ...backupForm, notes: event.target.value })}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="primary-button" disabled={submitting}>
                Enregistrer la preuve
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
