/*
 * ShoeTracker service worker: keeps the app shell available offline and rolls out
 * updates. Handles same-origin GET requests only; never touches user data.
 * WARNING: Bump VERSION on every deploy that changes a SHELL file, otherwise
 * installed apps keep serving the old cache.
 */

const VERSION = 'v2';
const CACHE = 'shoetracker-' + VERSION;

// INFO: './' is the entry point; a direct index.html request offline hits the navigation fallback.
const SHELL = [
  './',
  './faq.html',
  './datenschutz.html',
  './en/faq.html',
  './en/privacy.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/i18n.js',
  './assets/js/app.js',
  './assets/js/boot.js',
  './assets/icons/favicon-32.png',
  './assets/icons/app-icon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // INFO: One by one instead of addAll so a missing file can't fail the install.
      // WARNING: cache: 'reload' bypasses the HTTP cache (GitHub Pages max-age=600);
      // without it a new version could precache files up to ten minutes stale.
      Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => null)))
    ).then(() => {
      // INFO: Activate immediately; app.js decides when to reload (never mid-input).
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so updates arrive, cached shell as fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => caches.match(request)
          .then((cached) => cached || caches.match('./'))
          .then((cached) => cached || offlineResponse()))
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          cachePut(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

function cachePut(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return;
  caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => {});
}

function offlineResponse() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
    '<p style="font:16px system-ui;padding:24px">ShoeTracker ist offline und noch nicht vollständig installiert. ' +
    'Bitte einmal mit Internetverbindung öffnen.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
  );
}
