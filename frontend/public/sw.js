/**
 * Service worker — makes the app shell open with no network.
 *
 * Scope of what is cached, and what deliberately is NOT:
 *
 *   CACHED    the HTML shell, hashed /assets/* bundles, manifest and icon.
 *             Hashed filenames change on every build, so cache-first is safe
 *             and a deploy can never serve a stale bundle.
 *
 *   NEVER     anything cross-origin. Firestore in particular must always hit
 *             the network — caching it would freeze realtime sync and serve
 *             stale reports. The Firestore SDK does its own offline handling.
 *
 * Navigation is network-first so a fresh deploy is picked up as soon as the
 * device is online, falling back to the cached shell when it is not.
 */

const VERSION = 'v2.3.0';
const SHELL_CACHE = `flash-report-shell-${VERSION}`;
const ASSET_CACHE = `flash-report-assets-${VERSION}`;

const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Firestore, Google Fonts, …) always goes straight to the
  // network. Caching Firestore would break realtime sync.
  if (url.origin !== self.location.origin) return;

  // Page loads: network-first, cached shell as the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Hashed build output is immutable — cache-first.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // Everything else same-origin: serve cache, refresh in the background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
