'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

function selectConclusionInModal() {
  const modal = [...document.querySelectorAll<HTMLElement>('.modal-card')].at(-1);
  if (!modal) return false;

  const decisionSelect = [...modal.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
    [...select.options].some((option) => option.value === 'COMPLETE'),
  );
  if (!decisionSelect) return false;

  decisionSelect.value = 'COMPLETE';
  decisionSelect.dispatchEvent(new Event('change', { bubbles: true }));

  const form = modal.querySelector('form');
  const previousNotice = modal.querySelector('.consultation-conclusion-notice');
  previousNotice?.remove();
  if (form) {
    const notice = document.createElement('div');
    notice.className = 'consultation-orientation-notice consultation-conclusion-notice';
    notice.innerHTML =
      '<strong>Conclusion de la consultation</strong><span>Complétez l’interprétation des résultats, le diagnostic final, les consignes, la prescription éventuelle et l’orientation avant d’enregistrer puis de signer.</span>';
    form.prepend(notice);
  }

  const decisionSection = [...modal.querySelectorAll<HTMLElement>('section')].find((section) =>
    section.textContent?.includes('Décision de fin de consultation'),
  );
  window.setTimeout(() => {
    decisionSection?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    decisionSelect.focus();
  }, 80);
  return true;
}

function openConclusion() {
  const actionGrid = document.querySelector<HTMLElement>('.consultation-action-grid');
  const openButton = actionGrid
    ? [...actionGrid.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent?.includes('Interpréter et décider'),
      )
    : undefined;
  if (!openButton) return;

  openButton.click();
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (selectConclusionInModal() || attempts >= 20) window.clearInterval(timer);
  }, 100);
}

export function ConsultationConclusionAction() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/consultations') return;

    const enhance = () => {
      document.querySelectorAll<HTMLElement>('.consultation-action-grid').forEach((grid) => {
        if (grid.querySelector('[data-conclude-consultation]')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary-button';
        button.dataset.concludeConsultation = 'true';
        button.textContent = 'Conclure la consultation';
        button.addEventListener('click', openConclusion);
        grid.append(button);
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
