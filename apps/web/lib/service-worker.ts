const READY_TIMEOUT_MS = 8000;

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function serviceWorkerSupported() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'serviceWorker' in navigator
  );
}

export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!serviceWorkerSupported()) {
    throw new Error('Le service worker n’est pas disponible dans ce navigateur ou cette connexion.');
  }

  if (!registrationPromise) {
    registrationPromise = (async () => {
      const existing = await navigator.serviceWorker.getRegistration('/');
      const registration =
        existing ??
        (await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        }));

      void registration.update().catch(() => undefined);
      if (registration.active) return registration;

      return withTimeout(
        navigator.serviceWorker.ready,
        READY_TIMEOUT_MS,
        'Le service de notification met trop de temps à démarrer. Rechargez la page.',
      );
    })().catch((error) => {
      registrationPromise = null;
      throw error;
    });
  }

  return registrationPromise;
}
