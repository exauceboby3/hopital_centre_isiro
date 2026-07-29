'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function hideAppointmentVitalControls() {
  document.querySelectorAll<HTMLElement>('.vital-summary').forEach((element) => {
    element.hidden = true;
  });

  document.querySelectorAll<HTMLButtonElement>('.row-actions button').forEach((button) => {
    if (button.textContent?.toLocaleLowerCase('fr').includes('signes vitaux')) {
      button.hidden = true;
    }
  });
}

export function AppointmentVitalsVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/appointments') return;

    hideAppointmentVitalControls();
    const observer = new MutationObserver(hideAppointmentVitalControls);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
