'use client';

import { BellRing, LoaderCircle, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/notifications';
import {
  pushNotificationsSupported,
  pushSynchronizationIntervalMs,
  sendPushNotificationTest,
  synchronizePushSubscription,
} from '@/lib/push-notifications';
import { useAuth } from './auth-provider';

const DISMISSED_KEY = 'chi-push-notification-prompt-dismissed-v1';

export function PushNotificationManager() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const initializedUserId = useRef<string | null>(null);

  const hidePrompt = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Le masquage reste valable pour la session si le stockage local est indisponible.
    }
  }, []);

  useEffect(() => {
    if (!user || initializedUserId.current === user.id) return;
    initializedUserId.current = user.id;

    const available = pushNotificationsSupported();
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
        void synchronizePushSubscription(user.id, { force: true }).catch((error) => {
          console.error('Synchronisation silencieuse des notifications impossible', error);
        });
      }
      return;
    }

    setDismissed(previouslyDismissed);
  }, [user]);

  useEffect(() => {
    if (!user || !supported || Notification.permission !== 'granted') return;

    const synchronize = () => {
      if (document.visibilityState === 'hidden' || !navigator.onLine) return;
      void synchronizePushSubscription(user.id).catch((error) => {
        console.error('Réparation automatique des notifications impossible', error);
      });
    };
    const onVisibilityChange = () => synchronize();

    window.addEventListener('online', synchronize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(synchronize, pushSynchronizationIntervalMs);
    return () => {
      window.removeEventListener('online', synchronize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [supported, user]);

  const enable = async () => {
    if (!user || !supported || busy || Notification.permission !== 'default') {
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

      await synchronizePushSubscription(user.id, { force: true });
      await sendPushNotificationTest();
      hidePrompt();
      notifySuccess(
        'Les notifications sont actives. Une notification de test vient d’être envoyée.',
      );
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
