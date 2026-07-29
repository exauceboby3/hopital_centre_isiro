'use client';

import {
  Activity,
  BedDouble,
  CalendarDays,
  FlaskConical,
  Pill,
  Receipt,
  Stethoscope,
  Users,
  UserCheck,
  UserRoundCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Summary {
  patients: number | null;
  appointmentsToday: number | null;
  consultationsToday: number | null;
  pendingExams: number | null;
  activeHospitalizations: number | null;
  totalBeds: number | null;
  occupancyRate: number | null;
  pendingRevenue: number | null;
  lowStock: number | null;
  presence: {
    present: number;
    absent: number;
    onDuty: number;
    mine?: { status: string; clockIn?: string; clockOut?: string } | null;
  };
  doctors: { total: number | null; busy: number | null; available: number | null };
  visibility: {
    finance: boolean;
    stock: boolean;
    patients: boolean;
    appointments: boolean;
    consultations: boolean;
    laboratory: boolean;
    hospitalizations: boolean;
    doctorAvailability: boolean;
  };
}

const initialSummary: Summary = {
  patients: null,
  appointmentsToday: null,
  consultationsToday: null,
  pendingExams: null,
  activeHospitalizations: null,
  totalBeds: null,
  occupancyRate: null,
  pendingRevenue: null,
  lowStock: null,
  presence: { present: 0, absent: 0, onDuty: 0, mine: null },
  doctors: { total: null, busy: null, available: null },
  visibility: {
    finance: false,
    stock: false,
    patients: false,
    appointments: false,
    consultations: false,
    laboratory: false,
    hospitalizations: false,
    doctorAvailability: false,
  },
};

export default function DashboardPage() {
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Summary>('/dashboard/summary')
      .then(setSummary)
      .catch((exception: unknown) =>
        setError(exception instanceof Error ? exception.message : 'Chargement impossible.'),
      )
      .finally(() => setLoading(false));
  }, []);

  const metrics = [
    summary.visibility.patients
      ? { label: 'Patients actifs', value: summary.patients, icon: Users, tone: 'blue' }
      : null,
    summary.visibility.appointments
      ? {
          label: "Rendez-vous aujourd'hui",
          value: summary.appointmentsToday,
          icon: CalendarDays,
          tone: 'violet',
        }
      : null,
    summary.visibility.consultations
      ? {
          label: "Consultations aujourd'hui",
          value: summary.consultationsToday,
          icon: Stethoscope,
          tone: 'green',
        }
      : null,
    summary.visibility.laboratory
      ? {
          label: 'Examens en attente',
          value: summary.pendingExams,
          icon: FlaskConical,
          tone: 'orange',
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Vue générale</span>
          <h1>Tableau de bord</h1>
          <p>Suivi en temps réel des activités hospitalières.</p>
        </div>
        <div className="date-chip">
          {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date())}
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="metric-grid">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}>
              <Icon size={22} />
            </div>
            <span>{label}</span>
            <strong>{loading || value === null ? '—' : value.toLocaleString('fr-FR')}</strong>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Personnel</span>
              <h2>Présence aujourd’hui</h2>
            </div>
            <UserCheck size={23} />
          </div>
          <div className="summary-list">
            <span>
              Présents <strong>{summary.presence.present}</strong>
            </span>
            <span>
              De garde maintenant <strong>{summary.presence.onDuty}</strong>
            </span>
            <span>
              Absents <strong>{summary.presence.absent}</strong>
            </span>
          </div>
          <span className="muted">
            Ma présence : {summary.presence.mine?.status ?? 'non pointée'}
          </span>
        </article>

        {summary.visibility.doctorAvailability && (
          <article className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Orientation clinique</span>
                <h2>Disponibilité des médecins</h2>
              </div>
              <UserRoundCheck size={23} />
            </div>
            <div className="summary-list">
              <span>
                Disponibles <strong>{summary.doctors.available ?? 0}</strong>
              </span>
              <span>
                Occupés en consultation <strong>{summary.doctors.busy ?? 0}</strong>
              </span>
              <span>
                Total actif <strong>{summary.doctors.total ?? 0}</strong>
              </span>
            </div>
          </article>
        )}

        {summary.visibility.hospitalizations && (
          <article className="panel occupancy-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Hospitalisation</span>
                <h2>Occupation des lits</h2>
              </div>
              <BedDouble size={23} />
            </div>
            <div className="occupancy-value">
              <strong>{summary.occupancyRate ?? 0}%</strong>
              <span>
                {summary.activeHospitalizations ?? 0} lits occupés sur {summary.totalBeds ?? 0}
              </span>
            </div>
            <div className="progress-track">
              <div style={{ width: `${Math.min(summary.occupancyRate ?? 0, 100)}%` }} />
            </div>
          </article>
        )}

        {summary.visibility.finance && summary.pendingRevenue !== null && (
          <article className="panel finance-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Finances</span>
                <h2>Montant à recouvrer</h2>
              </div>
              <Receipt size={23} />
            </div>
            <strong className="large-value">
              {(summary.pendingRevenue ?? 0).toLocaleString('fr-CD')} CDF
            </strong>
            <span className="muted">Factures en attente ou partiellement payées</span>
          </article>
        )}

        {summary.visibility.stock && summary.lowStock !== null && (
          <article className="panel stock-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Pharmacie</span>
                <h2>Alertes de stock</h2>
              </div>
              <Pill size={23} />
            </div>
            <div className={(summary.lowStock ?? 0) > 0 ? 'stock-alert' : 'stock-ok'}>
              <Activity size={22} />
              <strong>{summary.lowStock ?? 0}</strong>
              <span>médicament(s) sous le seuil minimal</span>
            </div>
          </article>
        )}
      </section>
    </>
  );
}
