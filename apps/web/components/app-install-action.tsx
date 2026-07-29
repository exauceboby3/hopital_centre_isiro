'use client';

import { Download, Share2, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { notifySuccess } from '@/lib/notifications';
import { Modal } from './modal';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function AppInstallAction() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const resolveTarget = () => {
      const next = document.querySelector<HTMLElement>('.topbar-actions');
      setTarget((current) => (current === next ? current : next));
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
      notifySuccess('L’application est installée sur cet appareil.');
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      observer.disconnect();
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = async () => {
    if (ios) {
      setIosHelp(true);
      return;
    }
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setPromptEvent(null);
  };

  if (installed || !target || (!ios && !promptEvent)) return null;

  return (
    <>
      {createPortal(
        <button
          type="button"
          className="install-app-button"
          onClick={() => void install()}
          title="Installer l’application"
        >
          <Download size={17} />
          <span>Installer</span>
        </button>,
        target,
        'application-install-action',
      )}

      {iosHelp && (
        <Modal
          title="Installer sur l’iPhone ou l’iPad"
          eyebrow="Ajout à l’écran d’accueil"
          onClose={() => setIosHelp(false)}
        >
          <div className="ios-install-steps">
            <div><Share2 size={22} /><span><strong>1. Ouvrez le menu Partager</strong><small>Dans Safari, touchez l’icône carrée avec une flèche vers le haut.</small></span></div>
            <div><Smartphone size={22} /><span><strong>2. Ajouter à l’écran d’accueil</strong><small>Faites défiler le menu, puis choisissez « Ajouter à l’écran d’accueil ».</small></span></div>
            <div><Download size={22} /><span><strong>3. Confirmez avec Ajouter</strong><small>L’icône CHI apparaîtra parmi vos applications.</small></span></div>
          </div>
          <div className="modal-actions">
            <button type="button" className="primary-button" onClick={() => setIosHelp(false)}>Compris</button>
          </div>
        </Modal>
      )}
    </>
  );
}
