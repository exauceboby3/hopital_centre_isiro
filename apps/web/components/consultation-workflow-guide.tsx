'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const decisionGuidance: Record<string, { title: string; detail: string }> = {
  CONTINUE: {
    title: 'Consultation en cours',
    detail:
      'Complétez l’anamnèse, l’examen physique, le diagnostic et la conduite thérapeutique avant de choisir une orientation finale.',
  },
  LABORATORY: {
    title: 'Orientation vers le laboratoire',
    detail:
      'Sélectionnez les examens. Le patient quitte temporairement le médecin, la consultation reste ouverte et le médecin devient disponible jusqu’au retour des résultats validés.',
  },
  IMAGING: {
    title: 'Orientation vers l’imagerie',
    detail:
      'Choisissez l’examen d’imagerie et enregistrez l’indication clinique. Le patient suit le circuit d’imagerie avant la décision finale.',
  },
  HOSPITALIZATION: {
    title: 'Hospitalisation demandée',
    detail:
      'Après l’enregistrement, la consultation médicale est clôturée, le médecin redevient disponible et la réception avec les infirmiers organise le lit. Le séjour est facturé à la sortie.',
  },
  TRANSFER: {
    title: 'Transfert médical',
    detail:
      'Choisissez le médecin destinataire et précisez le motif. Le patient rejoint sa nouvelle file sans créer un deuxième épisode de soins.',
  },
  PRESCRIPTION: {
    title: 'Prescription et retour à domicile',
    detail:
      'Créez l’ordonnance structurée ci-dessus. Une facture de médicaments est générée et la pharmacie délivre uniquement après paiement ou garantie valide.',
  },
  DISCHARGE: {
    title: 'Libération du patient',
    detail:
      'Vérifiez le diagnostic final, les consignes, la conduite thérapeutique et les éventuels rendez-vous de contrôle avant de clôturer puis signer.',
  },
  COMPLETE: {
    title: 'Conclusion de la consultation',
    detail:
      'Relisez l’ensemble du dossier, confirmez l’orientation finale, enregistrez la décision puis signez pour verrouiller la version médicale.',
  },
};

function guideMarkup() {
  return `
    <div class="consultation-workflow-steps" aria-label="Étapes de la consultation">
      <div class="consultation-workflow-step"><b>1. Évaluer</b><span>Motif, histoire, antécédents et signes vitaux</span></div>
      <div class="consultation-workflow-step"><b>2. Examiner</b><span>Examen physique et hypothèses diagnostiques</span></div>
      <div class="consultation-workflow-step"><b>3. Interpréter</b><span>Résultats paracliniques et diagnostic final</span></div>
      <div class="consultation-workflow-step"><b>4. Décider</b><span>Prescription, sortie, transfert ou hospitalisation</span></div>
      <div class="consultation-workflow-step"><b>5. Clôturer</b><span>Enregistrer, relire puis signer la décision finale</span></div>
    </div>
    <div class="consultation-workflow-context" aria-live="polite">
      <strong></strong>
      <small></small>
    </div>
  `;
}

function enhanceConsultationModal(modal: HTMLElement) {
  const form = modal.querySelector<HTMLFormElement>('form.clinical-consultation-form');
  if (!form) return;

  let guide = form.querySelector<HTMLElement>('.consultation-workflow-guide');
  if (!guide) {
    guide = document.createElement('section');
    guide.className = 'consultation-workflow-guide';
    guide.innerHTML = guideMarkup();
    form.prepend(guide);
  }

  const decision = [...form.querySelectorAll<HTMLSelectElement>('select')].find((select) =>
    [...select.options].some((option) => option.value === 'HOSPITALIZATION'),
  );
  if (!decision) return;

  const update = () => {
    const guidance = decisionGuidance[decision.value] ?? decisionGuidance.CONTINUE!;
    const title = guide?.querySelector<HTMLElement>('.consultation-workflow-context strong');
    const detail = guide?.querySelector<HTMLElement>('.consultation-workflow-context small');
    if (title && title.textContent !== guidance.title) title.textContent = guidance.title;
    if (detail && detail.textContent !== guidance.detail) detail.textContent = guidance.detail;
  };

  if (!decision.dataset.workflowGuideReady) {
    decision.dataset.workflowGuideReady = 'true';
    decision.addEventListener('change', update);
  }
  update();
}

export function ConsultationWorkflowGuide() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/consultations') return;

    const enhance = () => {
      document.querySelectorAll<HTMLElement>('.modal-card').forEach(enhanceConsultationModal);
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
