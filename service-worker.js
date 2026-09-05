// ============================================================
// Service Worker: makes the app shell (HTML/CSS/JS) load
// instantly with ZERO internet after the first visit.
// Supabase API calls always go to the network (can't meaningfully
// cache live data), but the app itself will open offline.
//
// HTML pages use NETWORK-FIRST: when you have internet, you always
// get the latest deployed version (so updates like new form fields
// show up immediately) — it only falls back to the cached copy when
// there's genuinely no connection. Static assets (CSS/JS/icons) stay
// CACHE-FIRST for instant loading, since those change less often.
// ============================================================
const CACHE_NAME = 'thuku-enterprise-shell-v5';

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

function isHtmlRequest(request) {
  return request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept Supabase API/auth calls or other cross-origin
  // requests — those must always go live to the network.
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTML pages: network-first, so a fresh deploy is picked up on the
  // very next load while you're online. Falls back to the cached
  // copy only if the network request fails (offline).
  if (isHtmlRequest(event.request)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (CSS/JS/icons): cache-first, so it opens instantly
  // even offline.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cache newly-seen same-origin files too (e.g. future pages)
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => cached);
    })
  );
});
