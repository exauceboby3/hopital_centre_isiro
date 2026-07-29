'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function synchronizePrescriptionSections() {
  document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
    const decision = [...modal.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
      [...select.options].some((option) => option.value === 'PRESCRIPTION'),
    );
    const slot = modal.querySelector<HTMLElement>('.consultation-prescription-slot');
    if (!decision || !slot) return;

    const visible = decision.value === 'PRESCRIPTION';
    slot.hidden = !visible;
    slot.setAttribute('aria-hidden', visible ? 'false' : 'true');
    slot.classList.toggle('prescription-decision-active', visible);
  });
}

export function ConsultationPrescriptionVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/consultations') return;

    const onChange = (event: Event) => {
      const select = event.target as HTMLSelectElement | null;
      if (!select || select.tagName !== 'SELECT') return;
      if (![...select.options].some((option) => option.value === 'PRESCRIPTION')) return;
      synchronizePrescriptionSections();
    };

    synchronizePrescriptionSections();
    const observer = new MutationObserver(synchronizePrescriptionSections);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('change', onChange, true);

    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChange, true);
    };
  }, [pathname]);

  return null;
}
