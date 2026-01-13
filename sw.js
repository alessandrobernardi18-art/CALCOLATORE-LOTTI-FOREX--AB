/* Simple PWA Service Worker (app shell + runtime cache) */
const VERSION = 'v1.0.1';
const APP_CACHE = `app-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/icon-180.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (![APP_CACHE, RUNTIME_CACHE].includes(key)) return caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

// Helpers
async function cacheFirst(req) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  cache.put(req, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const networkFetch = fetch(req).then((fresh) => {
    cache.put(req, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached || (await networkFetch) || (await caches.match('./offline.html'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Same-origin: cache-first for app shell pages/assets
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        // Navigations: serve cached index, fall back to offline
        if (req.mode === 'navigate') {
          const cached = await caches.match('./index.html');
          return cached || await fetch(req);
        }
        return await cacheFirst(req);
      } catch (e) {
        return await caches.match('./offline.html');
      }
    })());
    return;
  }

  // Third-party (e.g., cdnjs): stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});
