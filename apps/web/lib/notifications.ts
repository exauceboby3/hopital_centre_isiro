'use client';

export type NotificationKind = 'success' | 'error' | 'warning' | 'info';

export interface AppNotificationDetail {
  message: string;
  kind: NotificationKind;
  title?: string;
  duration?: number;
}

export const APP_NOTIFICATION_EVENT = 'hospital:notification';

export function notify(
  message: string,
  kind: NotificationKind = 'info',
  options: { title?: string; duration?: number } = {},
) {
  if (typeof window === 'undefined' || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent<AppNotificationDetail>(APP_NOTIFICATION_EVENT, {
      detail: {
        message: message.trim(),
        kind,
        title: options.title,
        duration: options.duration,
      },
    }),
  );
}

export const notifySuccess = (message: string, title = 'Opération réussie') =>
  notify(message, 'success', { title });

export const notifyError = (message: string, title = 'Action impossible') =>
  notify(message, 'error', { title, duration: 7000 });

export const notifyWarning = (message: string, title = 'Attention') =>
  notify(message, 'warning', { title, duration: 6000 });
