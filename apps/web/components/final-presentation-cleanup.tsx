'use client';

import { useEffect } from 'react';

const replacements: Array<[RegExp, string]> = [
  [/Fiche patient mensuelle avec consultations incluses/gi, 'Fiche patient mensuelle'],
  [/Consultation générale incluse dans la fiche mensuelle/gi, 'Consultation générale'],
  [/Consultation pédiatrique incluse dans la fiche mensuelle/gi, 'Consultation pédiatrique'],
  [/Médecins disponibles/gi, 'Disponibilité des médecins'],
  [/Disponibilité à confirmer/gi, 'Hors service'],
  [/Présence non confirmée/gi, 'Hors service'],
];

function replaceText(root: Node, rules = replacements) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (parent && !['SCRIPT', 'STYLE', 'CODE'].includes(parent.tagName)) {
      let value = node.nodeValue ?? '';
      rules.forEach(([pattern, replacement]) => {
        value = value.replace(pattern, replacement);
      });
      if (value !== node.nodeValue) node.nodeValue = value;
    }
    node = walker.nextNode();
  }
}

function organizeInvoiceModals() {
  document.querySelectorAll<HTMLElement>('.modal-card').forEach((modal) => {
    const invoiceRows = modal.querySelectorAll<HTMLElement>('.invoice-modal-row');
    if (!invoiceRows.length) return;
    modal.classList.add('invoice-ledger-modal');
    modal.dataset.invoiceCount = String(invoiceRows.length);

    if (invoiceRows.length === 1) {
      modal.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        replaceText(button, [
          [/Facture groupée/gi, 'Facture'],
          [/Reçu groupé/gi, 'Reçu'],
        ]);
      });
    }
  });
}

function synchronizePresentation() {
  replaceText(document.body);
  organizeInvoiceModals();
}

export function FinalPresentationCleanup() {
  useEffect(() => {
    synchronizePresentation();
    const observer = new MutationObserver(synchronizePresentation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
