'use client';

import { BellRing, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/notifications';
import { ensureServiceWorker, serviceWorkerSupported } from '@/lib/service-worker';
import { useAuth } from './auth-provider';

interface PushConfiguration {
  enabled: boolean;
  publicKey: string;
  privacy: string;
}

const DISMISSED_KEY = 'chi-push-notification-prompt-dismissed-v1';

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  const result = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(result).set(bytes);
  return result;
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!serialized.endpoint || !p256dh || !auth) {
    throw new Error('L’abonnement de notification produit par le navigateur est incomplet.');
  }
  await api('/push-notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: serialized.endpoint, keys: { p256dh, auth } }),
  });
}

async function createOrSynchronizeSubscription() {
  const configuration = await api<PushConfiguration>('/push-notifications/public-key');
  if (!configuration.enabled || !configuration.publicKey) {
    throw new Error('Le service de notification du serveur est indisponible.');
  }

  const registration = await ensureServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(configuration.publicKey),
    }));
  await sendSubscriptionToServer(subscription);
}

export function PushNotificationManager() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const initialized = useRef(false);

  const hidePrompt = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Le masquage reste valable pour la session si le stockage local est indisponible.
    }
  }, []);

  useEffect(() => {
    if (!user || initialized.current) return;
    initialized.current = true;

    const available =
      serviceWorkerSupported() &&
      'Notification' in window &&
      'PushManager' in window;
    setSupported(available);
    if (!available) return;

    const currentPermission = Notification.permission;
    setPermission(currentPermission);

    let previouslyDismissed = false;
    try {
      previouslyDismissed = window.localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      previouslyDismissed = false;
    }

    // Une autorisation déjà accordée ou bloquée ne doit jamais produire un nouveau bandeau.
    if (currentPermission !== 'default') {
      setDismissed(true);
      if (currentPermission === 'granted') {
        void createOrSynchronizeSubscription().catch((error) => {
          console.error('Synchronisation silencieuse des notifications impossible', error);
        });
      }
      return;
    }

    setDismissed(previouslyDismissed);
  }, [user]);

  const enable = async () => {
    if (!supported || busy || Notification.permission !== 'default') {
      setPermission(Notification.permission);
      setDismissed(true);
      return;
    }

    setBusy(true);
    try {
      const decision = await Notification.requestPermission();
      setPermission(decision);
      if (decision !== 'granted') {
        hidePrompt();
        notifyWarning(
          'Les notifications n’ont pas été autorisées. Elles pourront être modifiées dans les paramètres du navigateur.',
          'Notifications non autorisées',
        );
        return;
      }

      await createOrSynchronizeSubscription();
      hidePrompt();
      notifySuccess('Les notifications sont maintenant actives sur cet appareil.');
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : 'Impossible d’activer les notifications.',
        'Activation impossible',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!user || !supported || dismissed || permission !== 'default') return null;

  return (
    <aside className="push-notification-card" aria-live="polite">
      <BellRing size={24} />
      <div>
        <strong>Activer les notifications sur cet appareil</strong>
        <span>Recevez les urgences, messages et alertes de service en arrière-plan.</span>
      </div>
      <button type="button" onClick={() => void enable()} disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={16} /> : <BellRing size={16} />}
        {busy ? 'Activation…' : 'Activer'}
      </button>
      <button type="button" className="icon-only" aria-label="Plus tard" onClick={hidePrompt}>
        <X size={16} />
      </button>
    </aside>
  );
}
