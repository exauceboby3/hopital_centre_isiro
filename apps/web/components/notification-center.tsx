'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  APP_NOTIFICATION_EVENT,
  AppNotificationDetail,
  NotificationKind,
} from '@/lib/notifications';

interface NotificationItem extends AppNotificationDetail {
  id: string;
}

const icons: Record<NotificationKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const titles: Record<NotificationKind, string> = {
  success: 'Opération réussie',
  error: 'Action impossible',
  warning: 'Attention',
  info: 'Information',
};

function notificationId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const seenAlerts = useRef(new WeakSet<Element>());

  useEffect(() => {
    const remove = (id: string) => setItems((current) => current.filter((item) => item.id !== id));
    const show = (detail: AppNotificationDetail) => {
      const id = notificationId();
      setItems((current) => [...current.slice(-3), { ...detail, id }]);
      window.setTimeout(() => remove(id), detail.duration ?? (detail.kind === 'error' ? 7000 : 4500));
    };

    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<AppNotificationDetail>).detail;
      if (detail?.message) show(detail);
    };

    const captureInlineAlerts = () => {
      document
        .querySelectorAll<HTMLElement>('.alert.success, .alert.error, .alert.warning')
        .forEach((alert) => {
          if (seenAlerts.current.has(alert) || !alert.textContent?.trim()) return;
          seenAlerts.current.add(alert);
          const kind: NotificationKind = alert.classList.contains('success')
            ? 'success'
            : alert.classList.contains('warning')
              ? 'warning'
              : 'error';
          show({ message: alert.textContent.trim(), kind });

          alert.hidden = true;
          alert.setAttribute('aria-hidden', 'true');
          alert.style.setProperty('display', 'none', 'important');
        });
    };

    window.addEventListener(APP_NOTIFICATION_EVENT, onNotification);
    captureInlineAlerts();
    const observer = new MutationObserver(captureInlineAlerts);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, onNotification);
      observer.disconnect();
    };
  }, []);

  if (!items.length) return null;

  return (
    <aside className="app-notification-stack" aria-live="polite" aria-atomic="false">
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <article className={`app-notification ${item.kind}`} key={item.id} role="status">
            <Icon size={21} />
            <div>
              <strong>{item.title ?? titles[item.kind]}</strong>
              <p>{item.message}</p>
            </div>
            <button
              type="button"
              aria-label="Fermer la notification"
              onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
            >
              <X size={16} />
            </button>
          </article>
        );
      })}
    </aside>
  );
}
