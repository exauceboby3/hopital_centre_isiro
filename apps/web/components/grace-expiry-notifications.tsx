'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { notifyWarning } from '@/lib/notifications';
import { hasAnyRole } from '@/lib/roles';
import { useAuth } from './auth-provider';

interface GraceAlert {
  id: string;
  number: string;
  validUntil: string;
  remainingMinutes: number;
  thresholdMinutes: number;
  patient: {
    medicalRecordNumber: string;
    lastName: string;
    postName?: string;
    firstName?: string;
  };
}

export function GraceExpiryNotifications() {
  const { user, loading } = useAuth();
  const seen = useRef(new Set<string>());
  const allowed = !loading && hasAnyRole(user, ['SUPER_ADMIN', 'ADMIN']);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const rows = await api<GraceAlert[]>('/clinical-governance/graces/alerts');
        if (cancelled) return;
        rows.forEach((row) => {
          const key = `${row.id}:${row.thresholdMinutes}`;
          if (seen.current.has(key)) return;
          seen.current.add(key);
          const name = [row.patient.lastName, row.patient.postName, row.patient.firstName]
            .filter(Boolean)
            .join(' ');
          const message = `${row.number} pour ${name} (${row.patient.medicalRecordNumber}) expire dans environ ${row.remainingMinutes} minute(s). Le contrôle financier reprendra automatiquement.`;
          notifyWarning(message, 'Expiration d’une mesure de grâce');
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Mesure de grâce bientôt expirée', { body: message });
          }
        });
      } catch {
        // Les alertes globales restent silencieuses si l’API est temporairement indisponible.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [allowed]);

  return null;
}
