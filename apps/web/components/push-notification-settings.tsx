'use client';

import { BellRing, CheckCircle2, RefreshCw, Smartphone, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { notifyError, notifySuccess, notifyWarning } from '@/lib/notifications';
import {
  installedAsApplication,
  localPushSubscriptionActive,
  pushNotificationsSupported,
  pushSubscriptionStatus,
  sendPushNotificationTest,
  synchronizePushSubscription,
} from '@/lib/push-notifications';
import { useAuth } from './auth-provider';

export function PushNotificationSettings() {
  const { user } = useAuth();
  const [supported, setSupported] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [localActive, setLocalActive] = useState(false);
  const [devices, setDevices] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const available = pushNotificationsSupported();
    setSupported(available);
    setInstalled(installedAsApplication());
    setPermission('Notification' in window ? Notification.permission : 'denied');
    try {
      const [serverStatus, activeHere] = await Promise.all([
        pushSubscriptionStatus(),
        localPushSubscriptionActive(),
      ]);
      setDevices(serverStatus.devices);
      setLocalActive(activeHere);
    } catch (error) {
      console.error('État des notifications indisponible', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const activateOrRepair = async () => {
    if (!user || busy || !supported) return;
    setBusy(true);
    try {
      let decision = Notification.permission;
      if (decision === 'default') decision = await Notification.requestPermission();
      setPermission(decision);
      if (decision !== 'granted') {
        notifyWarning(
          'Autorisez les notifications dans les paramètres du navigateur ou du téléphone.',
          'Autorisation requise',
        );
        return;
      }
      await synchronizePushSubscription(user.id, { force: true });
      await load();
      notifySuccess(
        'Cet appareil est relié au service d’alertes en arrière-plan.',
        'Notifications actives',
      );
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : 'Impossible de réparer les notifications.',
        'Activation impossible',
      );
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!user || busy || !localActive) return;
    setBusy(true);
    try {
      await synchronizePushSubscription(user.id, { force: true });
      await sendPushNotificationTest();
      notifySuccess(
        'Le serveur a envoyé une notification de test. Vérifiez la barre de notifications.',
        'Test envoyé',
      );
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : 'La notification de test a échoué.',
        'Test impossible',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel notification-settings-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Alertes professionnelles</span>
          <h2>Notifications en arrière-plan</h2>
        </div>
        <BellRing size={26} />
      </div>

      <p>
        Le serveur réveille le service de notification même lorsque l’application n’est plus
        affichée. Le téléphone doit rester connecté à Internet et autoriser les notifications.
      </p>

      <div className="notification-status-grid" aria-live="polite">
        <div>
          <BellRing size={18} />
          <span>Sur cet appareil</span>
          <strong>{loading ? 'Vérification…' : localActive ? 'Active' : 'À activer'}</strong>
        </div>
        <div>
          <Smartphone size={18} />
          <span>Appareils reliés</span>
          <strong>{loading ? '—' : devices}</strong>
        </div>
        <div>
          <CheckCircle2 size={18} />
          <span>Autorisation</span>
          <strong>
            {permission === 'granted'
              ? 'Accordée'
              : permission === 'denied'
                ? 'Bloquée'
                : 'À demander'}
          </strong>
        </div>
        <div>
          <Volume2 size={18} />
          <span>Mode application</span>
          <strong>{installed ? 'Installée' : 'Navigateur'}</strong>
        </div>
      </div>

      {!supported && (
        <div className="alert warning">
          Ce navigateur ne permet pas les notifications en arrière-plan. Sur iPhone, ajoutez d’abord
          l’application à l’écran d’accueil, puis ouvrez-la depuis son icône.
        </div>
      )}
      {permission === 'denied' && (
        <div className="alert warning">
          Les notifications sont bloquées sur cet appareil. Réactivez-les dans les paramètres du
          site ou de l’application, puis revenez ici.
        </div>
      )}
      <div className="notification-settings-actions">
        <button
          type="button"
          className="primary-button"
          disabled={busy || !supported || permission === 'denied'}
          onClick={() => void activateOrRepair()}
        >
          <RefreshCw className={busy ? 'spin' : ''} size={17} />
          {localActive ? 'Réparer la connexion' : 'Activer sur cet appareil'}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy || !localActive}
          onClick={() => void test()}
        >
          <Volume2 size={17} /> Tester l’alerte
        </button>
      </div>

      <small className="muted">
        Le volume final et le mode « Ne pas déranger » restent contrôlés par le téléphone.
      </small>
    </section>
  );
}
