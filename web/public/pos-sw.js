/**
 * Cashier service worker — scope /pos/ only.
 *
 * The contract this enforces: the tablet paints from cache, always. A network
 * that happens to be up updates the shell in the background; a network that is
 * down changes nothing the cashier can see.
 *
 * Three deliberate boundaries:
 *   - /manager, /r and /api are never intercepted. The dashboard is an online
 *     product and a cached API response would be indistinguishable from a fresh
 *     one.
 *   - Navigations are cache-first with a background refresh, so a cold tablet in
 *     a restaurant with no internet still opens.
 *   - Hashed build assets are immutable, so they are cached on first sight and
 *     never revalidated.
 *
 * Phase 12 hardens this (precise precache manifest, update prompts, cache
 * eviction). This is the baseline the split depends on.
 */

const VERSION = 'pos-shell-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SHELL_URL = '/pos';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([SHELL_URL, '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function handledByThisWorker(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/manager')) return false;
  if (url.pathname.startsWith('/r/')) return false;
  return url.pathname.startsWith('/pos') || isImmutableAsset(url);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!handledByThisWorker(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        // Network first for the shell, cache as the fallback.
        //
        // Cache-first is the instinct for an offline app, and it was the first
        // implementation — but it is wrong for the *shell* specifically. The
        // shell names content-hashed chunks, so a deploy changes those names;
        // a tablet holding yesterday's cached shell then asks for chunks that
        // no longer exist and the app fails to boot. Serving the shell from the
        // network when there is one keeps a deploy safe, and the fallback keeps
        // the till opening when there is not. The fetch is to a server on the
        // same counter, so the cost is milliseconds.
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(SHELL_URL, response.clone());
          return response;
        } catch {
          const cached = await cache.match(SHELL_URL);
          if (cached) return cached;
          throw new Error('offline and no cached shell');
        }
      }),
    );
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
