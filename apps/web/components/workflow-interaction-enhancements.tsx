'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { notifySuccess } from '@/lib/notifications';

const interactiveSelector = 'button, a, input, select, textarea, label, [role="button"]';
const operationalTranslations: Record<string, string> = {
  AVAILABLE: 'Disponible',
  BUSY: 'Occupé',
  UNKNOWN: 'Disponibilité à confirmer',
  PENDING_PAYMENT: 'Paiement attendu',
  RESULT_ENTERED: 'Résultat saisi',
  IN_PROGRESS: 'En cours',
  VALIDATED: 'Validé',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  CHECKED_IN: 'Arrivé',
  DRAFT: 'Facture à finaliser',
  CONSUMED: 'Admission enregistrée',
};

function waitUntilRemoved(element: Element, onSuccess: () => void, timeout = 7000) {
  if (!element.isConnected) {
    onSuccess();
    return;
  }
  const observer = new MutationObserver(() => {
    if (element.isConnected) return;
    observer.disconnect();
    onSuccess();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), timeout);
}

function translateOperationalText() {
  document
    .querySelectorAll<HTMLElement>(
      '.availability-grid, .modal-card, .table-panel, .patient-history-timeline',
    )
    .forEach((root) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT'].includes(parent.tagName)) {
          let value = node.textContent ?? '';
          for (const [status, label] of Object.entries(operationalTranslations)) {
            value = value.replace(new RegExp(`\\b${status}\\b`, 'g'), label);
          }
          if (value !== node.textContent) node.textContent = value;
        }
        node = walker.nextNode();
      }
    });
}

function hidePatientRegistrationVitals() {
  document.querySelectorAll<HTMLElement>('.modal-card .clinical-form-section').forEach((section) => {
    if (section.textContent?.includes('Signes vitaux d’accueil')) section.hidden = true;
  });
  document.querySelectorAll<HTMLElement>('.patient-number-notice span').forEach((element) => {
    if (element.textContent?.includes('les signes vitaux')) {
      element.textContent =
        'La réception saisit ici uniquement l’identité et les coordonnées. Les signes vitaux se saisissent depuis la ligne du patient.';
    }
  });
}

function makePatientRowsClickable() {
  document.querySelectorAll<HTMLTableRowElement>('.table-panel tbody tr').forEach((row) => {
    if (row.dataset.patientRowReady || !row.querySelector('.record-number')) return;
    const historyButton = [...row.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Historique'),
    );
    if (!historyButton) return;
    row.dataset.patientRowReady = 'true';
    row.classList.add('clickable-row', 'patient-clickable-row');
    row.tabIndex = 0;
    row.setAttribute(
      'aria-label',
      `Ouvrir le dossier ${row.querySelector('.record-number')?.textContent ?? ''}`,
    );
    const open = (event: Event) => {
      if ((event.target as Element | null)?.closest(interactiveSelector)) return;
      historyButton.click();
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        historyButton.click();
      }
    });
  });
}

function enhanceAppointmentPayment() {
  document.querySelectorAll<HTMLTableRowElement>('.table-panel tbody tr').forEach((row) => {
    if (!row.cells.length) return;
    const paymentCell = row.cells.item(5);
    const actionCell = row.cells.item(6);
    if (!paymentCell || !actionCell) return;

    const markArrived = [...actionCell.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Marquer arrivé'),
    );
    if (markArrived) markArrived.hidden = true;

    if (row.dataset.paymentEnhanced) return;
    const paymentText = paymentCell.textContent ?? '';
    const pending = /À payer|Paiement attendu|PENDING/i.test(paymentText);
    const cleared = /Autorisé|AUTHORIZED|Dérogation|WAIVED|Payé|PAID/i.test(paymentText);
    if (!pending && !cleared) return;

    row.dataset.paymentEnhanced = 'true';
    const note = document.createElement('span');
    note.className = 'payment-required-note';
    note.textContent = pending
      ? 'Après confirmation du paiement, l’arrivée sera enregistrée automatiquement.'
      : 'Paiement confirmé : arrivée enregistrée automatiquement.';
    paymentCell.append(note);
  });

  document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
    if (
      !modal.textContent?.includes('Planifier un rendez-vous') ||
      modal.querySelector('.payment-gate-notice')
    ) {
      return;
    }
    const form = modal.querySelector('form');
    if (!form) return;
    const notice = document.createElement('div');
    notice.className = 'payment-gate-notice';
    notice.innerHTML =
      '<strong>Paiement obligatoire avant la consultation</strong><span>Après l’enregistrement, une facture est créée. Dès que la caisse confirme le paiement ou la garantie, le patient est automatiquement marqué arrivé et placé dans la salle d’attente du médecin.</span>';
    form.prepend(notice);
  });
}

function enhanceConsultationWorkflow() {
  document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
    if (!modal.textContent?.includes('Consultation ·')) return;
    modal.querySelectorAll<HTMLElement>('label span').forEach((label) => {
      if (label.textContent?.includes("Tarif préalable d’hospitalisation")) {
        label.textContent = "Service d’hospitalisation facturé à la sortie";
      }
    });
  });
}

function enhanceHospitalizationPage() {
  document.querySelectorAll<HTMLTableCellElement>('.table-panel thead th').forEach((heading) => {
    if (heading.textContent?.trim() === 'Paiement') heading.textContent = 'Facturation à la sortie';
  });
}

function focusRequestedConsultation() {
  const parameters = new URLSearchParams(window.location.search);
  const recordNumber =
    parameters.get('patient') ??
    window.sessionStorage.getItem('hospital:open-consultation-patient');
  if (!recordNumber) return;

  const row = [...document.querySelectorAll<HTMLTableRowElement>('.table-panel tbody tr')].find(
    (entry) => entry.textContent?.includes(recordNumber),
  );
  if (!row) return;
  row.classList.add('consultation-focus-row');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function selectedClinicalDecision(form: HTMLFormElement) {
  return [...form.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
    [...select.options].some((option) => option.value === 'HOSPITALIZATION'),
  )?.value;
}

export function WorkflowInteractionEnhancements() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const enhance = () => {
      translateOperationalText();
      if (pathname === '/patients') {
        hidePatientRegistrationVitals();
        makePatientRowsClickable();
      }
      if (pathname === '/appointments') enhanceAppointmentPayment();
      if (pathname === '/consultations') {
        focusRequestedConsultation();
        enhanceConsultationWorkflow();
      }
      if (pathname === '/hospitalizations') enhanceHospitalizationPage();
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null;
      const modal = form?.closest<HTMLElement>('.modal-card');
      if (!form || !modal) return;

      if (modal.textContent?.includes('Planifier un rendez-vous')) {
        waitUntilRemoved(modal, () =>
          notifySuccess(
            'Le rendez-vous et sa facture ont été créés. La confirmation du paiement marquera automatiquement le patient comme arrivé.',
            'Rendez-vous enregistré',
          ),
        );
        return;
      }

      if (!modal.textContent?.includes('Consultation ·')) return;
      const decision = selectedClinicalDecision(form);
      if (decision === 'HOSPITALIZATION') {
        waitUntilRemoved(modal, () =>
          notifySuccess(
            'La demande d’hospitalisation a été transmise à la réception et aux infirmiers. Le médecin est maintenant disponible pour un autre patient; le séjour sera facturé à la sortie.',
            'Hospitalisation signalée',
          ),
        );
      }
      if (decision === 'PRESCRIPTION') {
        waitUntilRemoved(modal, () =>
          notifySuccess(
            'La consultation et l’ordonnance structurée ont été enregistrées. La facture des médicaments doit être réglée avant la délivrance à la pharmacie.',
            'Prescription enregistrée',
          ),
        );
      }
      if (decision === 'DISCHARGE' || decision === 'COMPLETE') {
        waitUntilRemoved(modal, () =>
          notifySuccess(
            'La conclusion médicale a été enregistrée. Signez la consultation pour clôturer officiellement l’épisode de soins.',
            'Consultation conclue',
          ),
        );
      }
    };

    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button');
      if (!button) return;
      const label = button.textContent?.trim() ?? '';

      if (/^(Accepter|Prendre en charge)$/i.test(label)) {
        const container = button.closest<HTMLElement>('.waiting-toast, .waiting-patient-card');
        const recordNumber = container?.textContent?.match(/CHI-\d{4}-\d+/i)?.[0];
        if (!container || !recordNumber) return;
        waitUntilRemoved(container, () => {
          notifySuccess(
            'Le patient a été accepté. La page Consultations affiche maintenant sa prise en charge et les résultats disponibles.',
          );
          window.sessionStorage.setItem('hospital:open-consultation-patient', recordNumber);
          window.dispatchEvent(
            new CustomEvent('hospital:focus-consultation', { detail: { recordNumber } }),
          );
          router.push(`/consultations?patient=${encodeURIComponent(recordNumber)}`);
        });
        return;
      }

      if (label === 'Enregistrer sortie') {
        waitUntilRemoved(button, () =>
          notifySuccess(
            'La sortie est enregistrée. La facture du séjour est maintenant finalisée et disponible à la caisse.',
            'Facture de sortie prête',
          ),
        );
      }
    };

    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('submit', onSubmit, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [router]);

  return null;
}
