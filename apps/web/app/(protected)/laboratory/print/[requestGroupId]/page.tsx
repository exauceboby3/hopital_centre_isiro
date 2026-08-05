'use client';

import { Activity } from 'lucide-react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import type { Patient } from '@/lib/types';
import styles from './laboratory-group-print.module.css';

interface PrintContext {
  profile: {
    name: string;
    legalName?: string;
    address?: string;
    phone?: string;
    email?: string;
    registrationNumber?: string;
    logoDataUrl?: string | null;
  };
  template?: {
    title?: string;
    headerText?: string;
    footerText?: string;
    showLogo: boolean;
  } | null;
}

interface ResultField {
  key: string;
  label: string;
  unit?: string;
  reference?: string;
}

interface GroupExam {
  id: string;
  type: string;
  status: string;
  workflowStatus: string;
  requestedAt: string;
  completedAt?: string;
  validatedAt?: string;
  result?: string;
  observations?: string;
  resultSchema?: ResultField[];
  resultData?: {
    values?: Array<{ key: string; value: string; note?: string }>;
    conclusion?: string;
  };
  catalogMetadata?: { specimenType?: string; method?: string };
  careAuthorization?: {
    status: string;
    paymentClearance?: { inOrder: boolean; status: 'IN_ORDER' | 'TO_REGULARIZE' };
  };
  performedByLabTech?: { lastName: string; postName?: string; firstName?: string };
  validatedByLabTech?: { lastName: string; postName?: string; firstName?: string };
}

interface LaboratoryGroup {
  id: string;
  patient: Patient;
  requestedAt: string;
  requestedByDoctor: {
    lastName: string;
    postName?: string;
    firstName?: string;
    specialty?: string;
  };
  exams: GroupExam[];
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('fr-CD', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(value),
  );

export default function LaboratoryGroupPrintPage() {
  const params = useParams<{ requestGroupId: string }>();
  const requestGroupId = params.requestGroupId;
  const [context, setContext] = useState<PrintContext | null>(null);
  const [group, setGroup] = useState<LaboratoryGroup | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requestGroupId) return;
    setError('');
    void Promise.all([
      api<PrintContext>('/configuration/print-context?kind=lab'),
      api<LaboratoryGroup>(`/laboratory/requests/${requestGroupId}`),
    ])
      .then(([printContext, laboratoryGroup]) => {
        setContext(printContext);
        setGroup(laboratoryGroup);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Demande de laboratoire indisponible.'),
      );
  }, [requestGroupId]);

  if (error) return <section className="panel alert error">{error}</section>;
  if (!context || !group) {
    return (
      <section className="panel empty-state">
        <Activity className="spin" /> Préparation des résultats groupés…
      </section>
    );
  }

  const profile = context.profile;
  const title = context.template?.title || 'RÉSULTATS DE LABORATOIRE';

  return (
    <article className={styles.document}>
      <header className={styles.header}>
        {context.template?.showLogo !== false && profile.logoDataUrl ? (
          <Image
            unoptimized
            src={profile.logoDataUrl}
            alt={`Logo ${profile.name}`}
            width={82}
            height={82}
          />
        ) : (
          <div className={styles.logoFallback}>LAB</div>
        )}
        <div className={styles.hospitalIdentity}>
          <strong>{profile.legalName || profile.name}</strong>
          {profile.address && <span>{profile.address}</span>}
          {(profile.phone || profile.email) && (
            <span>{[profile.phone, profile.email].filter(Boolean).join(' · ')}</span>
          )}
          {profile.registrationNumber && <span>N° {profile.registrationNumber}</span>}
        </div>
        <div className={styles.documentReference}>
          <span>Demande groupée</span>
          <strong>{group.id.slice(0, 8).toUpperCase()}</strong>
        </div>
      </header>

      {context.template?.headerText && (
        <p className={styles.templateText}>{context.template.headerText}</p>
      )}

      <h1>{title}</h1>
      <section className={styles.patientBlock}>
        <div>
          <span>Patient</span>
          <strong>{patientName(group.patient)}</strong>
        </div>
        <div>
          <span>N° dossier</span>
          <strong>{group.patient.medicalRecordNumber}</strong>
        </div>
        <div>
          <span>Sexe</span>
          <strong>{group.patient.sex || '—'}</strong>
        </div>
        <div>
          <span>Date de demande</span>
          <strong>{formatDate(group.requestedAt)}</strong>
        </div>
        <div>
          <span>Médecin demandeur</span>
          <strong>{patientName(group.requestedByDoctor)}</strong>
        </div>
        <div>
          <span>Examens</span>
          <strong>{group.exams.length}</strong>
        </div>
      </section>

      <section className={styles.results}>
        {group.exams.map((exam, index) => (
          <ExamResult key={exam.id} exam={exam} index={index + 1} />
        ))}
      </section>

      <footer className={styles.footer}>
        <span>Document regroupant {group.exams.length} examen(s) de la même demande.</span>
        <span>
          {context.template?.footerText ||
            'Résultats à interpréter dans le contexte clinique du patient.'}
        </span>
      </footer>
    </article>
  );
}

function ExamResult({ exam, index }: { exam: GroupExam; index: number }) {
  const definitions = new Map((exam.resultSchema ?? []).map((field) => [field.key, field]));
  const values = exam.resultData?.values ?? [];
  const validator = exam.validatedByLabTech
    ? patientName(exam.validatedByLabTech)
    : exam.performedByLabTech
      ? patientName(exam.performedByLabTech)
      : '—';

  return (
    <article className={styles.examCard}>
      <div className={styles.examHeading}>
        <div>
          <span>Examen {index}</span>
          <h2>{exam.type}</h2>
        </div>
        <strong>{exam.workflowStatus}</strong>
      </div>

      <div className={styles.examMetadata}>
        <span>
          <b>Échantillon :</b> {exam.catalogMetadata?.specimenType || 'Non précisé'}
        </span>
        <span>
          <b>Méthode :</b> {exam.catalogMetadata?.method || 'Non précisée'}
        </span>
        <span>
          <b>Validation :</b> {exam.validatedAt ? formatDate(exam.validatedAt) : 'Non validé'}
        </span>
      </div>

      {values.length > 0 ? (
        <table className={styles.resultTable}>
          <thead>
            <tr>
              <th>Rubrique</th>
              <th>Résultat</th>
              <th>Unité</th>
              <th>Valeur de référence</th>
              <th>Observation</th>
            </tr>
          </thead>
          <tbody>
            {values.map((value) => {
              const definition = definitions.get(value.key);
              return (
                <tr key={value.key}>
                  <td>{definition?.label || value.key}</td>
                  <td>
                    <strong>{value.value}</strong>
                  </td>
                  <td>{definition?.unit || '—'}</td>
                  <td>{definition?.reference || 'Selon méthode / patient'}</td>
                  <td>{value.note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className={styles.pendingResult}>{exam.result || 'Résultat non encore saisi.'}</p>
      )}

      {exam.resultData?.conclusion && (
        <p className={styles.conclusion}>
          <strong>Conclusion :</strong> {exam.resultData.conclusion}
        </p>
      )}
      {exam.observations && (
        <p className={styles.observation}>
          <strong>Indication / observation :</strong> {exam.observations}
        </p>
      )}
      <p className={styles.validationLine}>
        <strong>Technicien / biologiste :</strong> {validator}
      </p>
    </article>
  );
}
