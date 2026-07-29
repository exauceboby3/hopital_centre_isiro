'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function replaceText(element: Element | null, value: string) {
  if (element && element.textContent !== value) element.textContent = value;
}

function enhanceAppointmentPage() {
  document.querySelectorAll<HTMLElement>('.appointment-stage-card span').forEach((label) => {
    if (label.textContent?.trim() === 'Paiement attendu') {
      replaceText(label, 'Rendez-vous planifié');
    }
  });

  document
    .querySelectorAll<HTMLElement>('.status-badge.status-awaiting-payment')
    .forEach((badge) => replaceText(badge, 'Planifié'));

  document.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    const headers = [...table.querySelectorAll<HTMLTableCellElement>('thead th')];
    const accessIndex = headers.findIndex((header) => header.textContent?.trim() === 'Paiement');
    if (accessIndex < 0) return;

    replaceText(headers[accessIndex] ?? null, 'Accès par fiche');
    table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
      const cell = row.cells.item(accessIndex);
      if (!cell) return;
      const authorization = cell.querySelector<HTMLElement>('.status-badge.status-authorized');
      replaceText(authorization, 'Fiche active');
      const reference = cell.querySelector<HTMLElement>('.muted');
      replaceText(reference, 'Consultation incluse · 0 CDF');
    });
  });

  document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
    if (modal.textContent?.includes('Planifier un rendez-vous')) {
      const consultationLabel = [...modal.querySelectorAll<HTMLLabelElement>('label')].find((label) =>
        label.textContent?.includes('Type de consultation'),
      );
      const title = consultationLabel?.querySelector<HTMLElement>(':scope > span');
      replaceText(title ?? null, 'Type de consultation — incluse dans la fiche *');
      if (consultationLabel && !consultationLabel.querySelector('.appointment-file-help')) {
        const help = document.createElement('small');
        help.className = 'appointment-file-help muted';
        help.textContent =
          'Aucun frais de consultation supplémentaire : la fiche mensuelle de 5 000 CDF couvre la consultation.';
        consultationLabel.append(help);
      }
    }

    modal.querySelectorAll<HTMLElement>('strong').forEach((label) => {
      if (label.textContent?.trim() === 'Paiement') replaceText(label, 'Accès par fiche');
    });
    modal
      .querySelectorAll<HTMLElement>('.status-badge.status-authorized')
      .forEach((badge) => replaceText(badge, 'Fiche active'));
  });
}

export function AppointmentFileAccessPresentation() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/appointments') return;
    enhanceAppointmentPage();
    const observer = new MutationObserver(enhanceAppointmentPage);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
