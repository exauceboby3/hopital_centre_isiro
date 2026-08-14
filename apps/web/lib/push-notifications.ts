import { api } from './api';
import { ensureServiceWorker, serviceWorkerSupported } from './service-worker';

interface PushConfiguration {
  enabled: boolean;
  publicKey: string;
  privacy: string;
}

export interface PushSubscriptionStatus {
  subscribed: boolean;
  devices: number;
}

interface SynchronizationOptions {
  force?: boolean;
}

const SYNCHRONIZATION_INTERVAL_MS = 6 * 60 * 60 * 1000;

let lastSynchronization: { userId: string; synchronizedAt: number } | null = null;

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

export function pushNotificationsSupported() {
  return serviceWorkerSupported() && 'Notification' in window && 'PushManager' in window;
}

export function installedAsApplication() {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    navigatorWithStandalone.standalone === true
  );
}

export async function synchronizePushSubscription(
  userId: string,
  options: SynchronizationOptions = {},
): Promise<PushSubscription> {
  if (!pushNotificationsSupported()) {
    throw new Error('Les notifications en arrière-plan ne sont pas disponibles sur cet appareil.');
  }
  if (Notification.permission !== 'granted') {
    throw new Error('Autorisez d’abord les notifications dans les paramètres de cet appareil.');
  }

  const registration = await ensureServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const synchronizationIsFresh =
    !options.force &&
    existing &&
    lastSynchronization?.userId === userId &&
    Date.now() - lastSynchronization.synchronizedAt < SYNCHRONIZATION_INTERVAL_MS;
  if (synchronizationIsFresh) return existing;

  const configuration = await api<PushConfiguration>('/push-notifications/public-key');
  if (!configuration.enabled || !configuration.publicKey) {
    throw new Error('Le service de notification du serveur est indisponible.');
  }

  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeApplicationServerKey(configuration.publicKey),
    }));
  await sendSubscriptionToServer(subscription);
  lastSynchronization = { userId, synchronizedAt: Date.now() };
  return subscription;
}

export async function pushSubscriptionStatus(): Promise<PushSubscriptionStatus> {
  return api<PushSubscriptionStatus>('/push-notifications/status');
}

export async function localPushSubscriptionActive() {
  if (!pushNotificationsSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return Boolean(await registration?.pushManager.getSubscription());
}

export async function sendPushNotificationTest() {
  return api('/push-notifications/test', { method: 'POST' });
}

export const pushSynchronizationIntervalMs = SYNCHRONIZATION_INTERVAL_MS;
