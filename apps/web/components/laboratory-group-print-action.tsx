'use client';

import { Printer } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { patientName } from '@/lib/display';
import type { Patient } from '@/lib/types';
import { PrintPreviewButton } from './print-preview-modal';

interface LaboratoryExamSummary {
  id: string;
  requestGroupId: string;
  requestedAt: string;
  patient: Patient;
}

interface LaboratoryGroupSummary {
  id: string;
  requestedAt: string;
  patient: Patient;
  count: number;
}

const formatDate = (date: string) =>
  new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  );

export function LaboratoryGroupPrintAction() {
  const pathname = usePathname();
  const [rows, setRows] = useState<LaboratoryExamSummary[]>([]);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');

  useEffect(() => {
    if (pathname !== '/laboratory') {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api<LaboratoryExamSummary[]>('/laboratory/exams');
        if (!cancelled) setRows(data);
      } catch {
        // La page laboratoire affiche déjà les erreurs de chargement principales.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pathname]);

  const groups = useMemo(() => {
    const map = new Map<string, LaboratoryGroupSummary>();
    rows.forEach((row) => {
      const current = map.get(row.requestGroupId);
      if (current) current.count += 1;
      else {
        map.set(row.requestGroupId, {
          id: row.requestGroupId,
          requestedAt: row.requestedAt,
          patient: row.patient,
          count: 1,
        });
      }
    });
    return [...map.values()];
  }, [rows]);

  useEffect(() => {
    if (pathname !== '/laboratory') {
      setTarget(null);
      setSelectedGroupId('');
      return;
    }

    const locate = () => {
      const summaries = [...document.querySelectorAll<HTMLElement>('.lab-request-summary')];
      const summary = summaries.find((element) => {
        const dialog = element.closest<HTMLElement>('.modal-card');
        return Boolean(dialog?.querySelector('th')?.textContent?.includes('Examen'));
      });
      if (!summary) {
        setTarget(null);
        setSelectedGroupId('');
        return;
      }

      const dialog = summary.closest<HTMLElement>('.modal-card');
      const eyebrow = dialog?.querySelector<HTMLElement>('.modal-header .eyebrow')?.textContent?.trim();
      const group = groups.find(
        (item) =>
          eyebrow === `${item.patient.medicalRecordNumber} · Demande du ${formatDate(item.requestedAt)}`,
      );
      setTarget(summary);
      setSelectedGroupId(group?.id ?? '');
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [groups, pathname]);

  const group = groups.find((item) => item.id === selectedGroupId);
  if (!target || !group) return null;

  return createPortal(
    <PrintPreviewButton
      src={`/laboratory/print/${group.id}`}
      title={`Résultats groupés · ${patientName(group.patient)}`}
      subtitle={`${group.count} examen(s) de la même demande sur une seule feuille`}
      className="primary-button"
    >
      <Printer size={16} /> Imprimer toute la demande ({group.count})
    </PrintPreviewButton>,
    target,
  );
}
