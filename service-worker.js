// ============================================================
// Service Worker: Thuku Enterprise
// Caches the app shell for offline use.
// Supabase API/auth requests always go to the network.
// ============================================================

const CACHE_NAME = 'thuku-enterprise-shell-v4';

const APP_SHELL = [
  './',
  'index.html',
  'pos.html',
  'inventory.html',
  'dashboard.html',
  'staff.html',
  'reports.html',
  'css/style.css',
  'js/supabase-config.js',
  'js/offline-sync.js',
  'js/offline-cache.js',
  'js/reports.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

// ============================================================
// INSTALL
// ============================================================

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ACTIVATE
// Deletes all old caches.
// ============================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH
// ============================================================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept requests to Supabase or other external services.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Only handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // Cache-first strategy for the app shell.
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            // Only cache successful responses.
            if (
              networkResponse &&
              networkResponse.status === 200 &&
              networkResponse.type === 'basic'
            ) {
              const responseToCache = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }

            return networkResponse;
          })
          .catch(() => {
            // If offline and nothing is cached, return a simple
            // offline response instead of throwing an error.
            return new Response(
              'Thuku Enterprise is currently offline.',
              {
                status: 503,
                headers: {
                  'Content-Type': 'text/plain'
                }
              }
            );
          });
      })
  );
});
