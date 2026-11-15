// ============================================================================
// POLE POSITION 2026 — PWA SERVICE WORKER (NETWORK-FIRST + OFFLINE FALLBACK)
// ============================================================================

const CACHE_NAME = 'pole-position-2026-pwa-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg',
  './vendor/three.module.min.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;

  // Network-first so local dev & GitHub Pages updates never serve stale JS/CSS,
  // with instant fallback to Cache Storage when offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(req, clone))
            .catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: false }).then(
          (exact) =>
            exact ||
            caches.match(req, { ignoreSearch: true }).then(
              (loose) => loose || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())
            )
        )
      )
  );
});
