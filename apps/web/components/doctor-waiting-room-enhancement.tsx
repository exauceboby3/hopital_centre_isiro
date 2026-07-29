'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { hasAnyRole } from '@/lib/roles';
import { useAuth } from './auth-provider';

interface QueueRow {
  id: string;
  queuePosition: number;
  arrivalAt: string;
  waitingMinutes: number;
  patient: { medicalRecordNumber: string };
}

const formatTime = (value: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
    new Date(value),
  );

function enhanceToasts(rows: QueueRow[]) {
  document.querySelectorAll<HTMLElement>('.waiting-toast').forEach((toast) => {
    const row = rows.find((item) => toast.textContent?.includes(item.patient.medicalRecordNumber));
    if (!row) return;
    let queueInfo = toast.querySelector<HTMLElement>('.waiting-toast-queue-info');
    if (!queueInfo) {
      queueInfo = document.createElement('div');
      queueInfo.className = 'waiting-toast-queue-info';
      const main = toast.querySelector<HTMLElement>(':scope > div');
      main?.append(queueInfo);
    }
    if (queueInfo) {
      queueInfo.textContent = `Position ${row.queuePosition} · arrivée ${formatTime(row.arrivalAt)} · attente ${row.waitingMinutes} min`;
    }
  });
}

export function DoctorWaitingRoomEnhancement() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const allowed =
    !loading &&
    hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN', 'DOCTOR', 'SURGEON', 'MIDWIFE']);

  useEffect(() => {
    if (!allowed) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api<QueueRow[]>('/clinical-governance/doctor-waiting-room');
        if (!cancelled) setRows(result);
      } catch {
        if (!cancelled) setRows([]);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const enhance = () => enhanceToasts(rows);
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [allowed, rows]);

  return null;
}
