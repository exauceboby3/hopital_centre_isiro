'use client';

import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushOfflineQueue, offlineQueueEvent, pendingMutationCount } from '@/lib/offline-queue';
import { notifySuccess, notifyWarning } from '@/lib/notifications';
import { ensureServiceWorker, serviceWorkerSupported } from '@/lib/service-worker';

async function showSystemNotification(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const registration = await ensureServiceWorker();
  await registration.showNotification(title, {
    body,
    icon: '/software-logo.svg',
    badge: '/software-logo.svg',
    tag,
    data: { url: '/dashboard' },
  });
}

export function OfflineManager() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const previousOnline = useRef<boolean | null>(null);

  const refresh = useCallback(async (announce = false) => {
    const nextOnline = navigator.onLine;
    setOnline(nextOnline);
    setPending(await pendingMutationCount().catch(() => 0));
    const changed = previousOnline.current !== null && previousOnline.current !== nextOnline;
    previousOnline.current = nextOnline;
    if (!announce || !changed) return;

    if (nextOnline) {
      const title = 'Connexion rétablie';
      const message = 'La connexion Internet est de nouveau disponible. La synchronisation va commencer.';
      notifySuccess(message, title);
      await showSystemNotification(title, message, 'network-restored').catch(() => undefined);
    } else {
      const title = 'Connexion Internet perdue';
      const message =
        'Vous travaillez hors ligne. Les actions compatibles seront conservées sur cet appareil.';
      notifyWarning(message, title);
      await showSystemNotification(title, message, 'network-offline').catch(() => undefined);
    }
  }, []);

  const sync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    const before = await pendingMutationCount().catch(() => 0);
    setSyncing(true);
    try {
      await flushOfflineQueue();
      await refresh();
      if (before > 0) {
        const title = 'Synchronisation terminée';
        const message = 'Toutes les actions enregistrées hors ligne ont été envoyées au serveur.';
        notifySuccess(message, title);
        await showSystemNotification(title, message, 'offline-sync-complete').catch(() => undefined);
      }
    } finally {
      setSyncing(false);
    }
  }, [refresh, syncing]);

  useEffect(() => {
    if (serviceWorkerSupported()) {
      void ensureServiceWorker().catch((error) => {
        console.error('Échec d’enregistrement du service worker', error);
      });
    }

    const onOnline = () => void refresh(true).then(() => sync());
    const onOffline = () => void refresh(true);
    const onQueue = () => void refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(offlineQueueEvent, onQueue);
    void refresh();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(offlineQueueEvent, onQueue);
    };
  }, [refresh, sync]);

  if (online && pending === 0) return null;
  return (
    <div className={`offline-banner ${online ? 'sync-pending' : ''}`} role="status">
      {online ? <Wifi size={18} /> : <CloudOff size={18} />}
      <span>
        {online
          ? `${pending} action(s) en attente de synchronisation.`
          : 'Mode hors ligne actif. Les actions autorisées seront synchronisées au retour du réseau.'}
      </span>
      {pending > 0 && online && (
        <button onClick={() => void sync()} disabled={syncing}>
          <RefreshCw size={15} className={syncing ? 'spin' : ''} /> Synchroniser
        </button>
      )}
    </div>
  );
}
