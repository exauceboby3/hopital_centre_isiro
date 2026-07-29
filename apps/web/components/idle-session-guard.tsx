'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth-provider';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;
const ACTIVITY_THROTTLE_MS = 10 * 1000;
const activityEvents: Array<keyof WindowEventMap> = [
  'pointerdown',
  'keydown',
  'scroll',
  'touchstart',
  'focus',
];

export function IdleSessionGuard() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [warning, setWarning] = useState(false);
  const lastActivity = useRef(0);
  const lastRecordedActivity = useRef(0);
  const loggingOut = useRef(false);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastRecordedActivity.current < ACTIVITY_THROTTLE_MS) return;
    lastRecordedActivity.current = now;
    lastActivity.current = now;
    setWarning(false);
  }, []);

  const expireSession = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      await logout();
    } finally {
      router.replace('/login?reason=inactive');
    }
  }, [logout, router]);

  useEffect(() => {
    if (!user) return;
    lastActivity.current = Date.now();
    lastRecordedActivity.current = 0;
    loggingOut.current = false;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, recordActivity, { passive: true });
    }

    const timer = window.setInterval(() => {
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor >= IDLE_TIMEOUT_MS) {
        void expireSession();
        return;
      }
      setWarning(idleFor >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
    }, 5_000);

    return () => {
      window.clearInterval(timer);
      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, recordActivity);
      }
    };
  }, [user, recordActivity, expireSession]);

  if (!user || !warning) return null;

  return (
    <aside className="session-idle-warning" role="alert" aria-live="assertive">
      <div>
        <strong>Session bientôt fermée</strong>
        <span>Une minute d’inactivité restante. Bougez la souris ou appuyez sur une touche pour continuer.</span>
      </div>
      <button className="primary-button compact" onClick={recordActivity}>
        Continuer la session
      </button>
    </aside>
  );
}
