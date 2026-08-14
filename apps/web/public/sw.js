const CACHE = 'hopital-isiro-shell-v4';
const SHELL = ['/offline', '/manifest.webmanifest', '/software-logo.svg'];

async function cacheShell() {
  const cache = await caches.open(CACHE);
  await Promise.allSettled(
    SHELL.map(async (url) => {
      const response = await fetch(url, { cache: 'reload' });
      if (response.ok) await cache.put(url, response.clone());
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match('/offline');
        return (
          offline ??
          new Response('Connexion indisponible. Rechargez la page lorsque le réseau revient.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      }),
    );
    return;
  }

  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/software-logo.svg'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              void caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
  }
});

function notificationOptions(payload, defaultBody, defaultTag) {
  const urgent = payload.urgency === 'high';
  return {
    body: payload.body || defaultBody,
    icon: '/software-logo.svg',
    badge: '/software-logo.svg',
    tag: payload.tag || defaultTag,
    renotify: Boolean(payload.tag),
    requireInteraction: urgent,
    silent: false,
    vibrate: urgent ? [450, 120, 450, 120, 800] : [220, 100, 220],
    timestamp: Date.now(),
    data: { url: payload.url || '/dashboard' },
  };
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title || 'Centre Hospitalier d’Isiro';
  const options = notificationOptions(
    payload,
    'Une nouvelle information professionnelle est disponible.',
    'hospital-notification',
  );
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'SHOW_NOTIFICATION') return;
  const payload = event.data.payload || {};
  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'Centre Hospitalier d’Isiro',
      notificationOptions(
        payload,
        'Une nouvelle information est disponible.',
        'hospital-local-notification',
      ),
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const visible = clients.find((client) => client.url.startsWith(self.location.origin));
      if (visible) {
        visible.navigate(target);
        return visible.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
