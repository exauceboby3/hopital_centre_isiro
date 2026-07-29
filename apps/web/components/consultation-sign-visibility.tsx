'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const finalDecisionLabels = [
  'Prescrire et terminer',
  'Patient libéré',
  'Terminer la consultation',
  'Orienter vers hospitalisation',
  'Prescription et retour à domicile',
  'Consultation terminée',
  'Hospitalisation',
];

export function ConsultationSignVisibility() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/consultations') return;

    const update = () => {
      document.querySelectorAll<HTMLTableRowElement>('.table-panel tbody tr').forEach((row) => {
        const signButton = [...row.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
          button.textContent?.includes('Signer'),
        );
        if (!signButton) return;
        const text = row.textContent ?? '';
        const completed = /Terminé|Terminée|COMPLETED/.test(text);
        const finalDecision = finalDecisionLabels.some((label) => text.includes(label));
        signButton.hidden = !(completed && finalDecision);
        signButton.title = signButton.hidden
          ? 'La signature sera disponible après une décision finale et la clôture de la consultation.'
          : 'Signer et verrouiller la consultation.';
      });
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
