'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function AppointmentDoctorRequirement() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/appointments') return;

    const enforce = () => {
      document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
        if (!modal.textContent?.includes('Planifier un rendez-vous')) return;
        const label = [...modal.querySelectorAll<HTMLLabelElement>('label')].find((entry) =>
          entry.textContent?.includes('Médecin affecté'),
        );
        const input = label?.querySelector<HTMLInputElement>('input[role="combobox"]');
        const title = label?.querySelector<HTMLElement>(':scope > span');
        if (input) input.required = true;
        if (title && !title.textContent?.includes('*')) title.textContent = 'Médecin affecté *';
      });
    };

    enforce();
    const observer = new MutationObserver(enforce);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
