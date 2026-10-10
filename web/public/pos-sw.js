/**
 * Cashier service worker — scope /pos/ only.
 *
 * The contract this enforces: the till works with the network down, on every
 * one of its screens. A network that is up keeps the cache fresh; a network
 * that is down changes nothing the cashier can see.
 *
 * Boundaries:
 *   - /manager, /r and /api are never intercepted. The dashboard is an online
 *     product and a cached API response would be indistinguishable from a fresh
 *     one.
 *   - Every till screen is cached at install: its page, and the payload the
 *     Next.js router fetches to move to it (`/pos/payment/index.txt?_rsc=…`),
 *     with the code and style both name. Until batch 33 only the `/pos` page
 *     was: offline, «دفع» fetched the payment payload, failed, and Next fell
 *     back to a full load of the payload's address, which this worker
 *     answered with the order screen. The cashier could take an order and not
 *     its payment.
 *   - Pages and payloads are network-first, so a deploy (new chunk names) is
 *     picked up at once; the cache is the fallback.
 *   - Hashed build assets are immutable, so they are cached on first sight and
 *     never revalidated.
 */

// Stamped with the build id after `next build` (scripts/stamp-worker.mjs), so
// every deploy is a new worker that re-caches the till whole (batch 38).
const VERSION = 'pos-shell-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
// Which builds' code is kept: this one and the one before (batch 44).
const HISTORY_CACHE = 'pos-shell-history';

// Every screen of the till. A test holds this to the pages under app/(pos)/pos.
const POS_ROUTES = ['/pos/', '/pos/menu/', '/pos/orders/', '/pos/payment/', '/pos/report/', '/pos/shift-close/', '/pos/sync/'];
const SHELL_URL = '/pos/';

/** The router payload a static export serves beside each page. */
function payloadOf(route) {
  return `${route}index.txt`;
}

/** `/pos/payment`, `/pos/payment/index.html` or `…/index.txt` → `/pos/payment/`. */
function routeOf(pathname) {
  let path = pathname.replace(/index\.(?:html|txt)$/, '');
  if (!path.endsWith('/')) path += '/';
  return path;
}

// Build files a page or a payload names. A payload names them without the
// /_next/ prefix, and route-group folders put parentheses in the path, so the
// match runs to the first known extension rather than to a delimiter.
const ASSET_PATTERN = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\s\\]+?\.(?:js|css|woff2|woff|ttf|otf|png|jpg|jpeg|svg|webp|gif|ico)/g;

function assetsNamedIn(text) {
  const found = new Set();
  for (const match of text.matchAll(ASSET_PATTERN)) {
    found.add(match[0].startsWith('/_next/') ? match[0] : `/_next/${match[0]}`);
  }
  return found;
}

async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  const assets = await caches.open(ASSET_CACHE);
  const named = new Set();
  // All or nothing (review of 10 October, F04): a screen or a file that did
  // not download fails the install, so the browser keeps the worker it has,
  // with its caches, and tries again on a later visit. Skipping failures let a
  // worker take over without the payment screen or its code.
  for (const route of POS_ROUTES) {
    for (const url of [route, payloadOf(route)]) {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      const text = await response.clone().text();
      await shell.put(url, response);
      for (const asset of assetsNamedIn(text)) named.add(asset);
    }
  }
  await Promise.all(
    [...named].map(async (url) => {
      if (await assets.match(url)) return;
      // A hashed file a build before already holds is the same file.
      const earlier = await caches.match(url);
      if (earlier) {
        await assets.put(url, earlier);
        return;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} answered ${response.status}`);
      await assets.put(url, response);
    }),
  );
  try {
    await shell.add('/manifest.webmanifest');
  } catch {
    // Not needed to work offline.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

/**
 * Taking over keeps this build's caches and the build before's code: a page
 * opened before the deploy still runs that build and loads its chunks lazily
 * (batch 44). Everything older goes, by exact name ("…-new" must not keep
 * "…-newer-shell"), and caches that are not the till's are not ours to drop.
 */
async function takeOver() {
  const history = await caches.open(HISTORY_CACHE);
  const saved = await history.match('/history');
  const keys = await caches.keys();
  // A worker from before batch 44 kept no history: the code it left is the
  // build before.
  const before = saved
    ? await saved.json()
    : keys.filter((key) => key.startsWith('pos-shell-') && key.endsWith('-assets')).map((key) => key.slice(0, -'-assets'.length));
  const kept = [VERSION, ...before.filter((version) => version !== VERSION)].slice(0, 2);
  await history.put('/history', new Response(JSON.stringify(kept)));
  const keep = new Set([HISTORY_CACHE, SHELL_CACHE, ...kept.map((version) => `${version}-assets`)]);
  await Promise.all(keys.filter((key) => key.startsWith('pos-shell-') && !keep.has(key)).map((key) => caches.delete(key)));
  await self.clients.claim();
}

self.addEventListener('activate', (event) => {
  event.waitUntil(takeOver());
});

function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isPayload(url) {
  return url.pathname.endsWith('/index.txt') || url.searchParams.has('_rsc');
}

function handledByThisWorker(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/manager')) return false;
  if (url.pathname.startsWith('/r/')) return false;
  return url.pathname.startsWith('/pos') || isImmutableAsset(url);
}

/** Network first, refreshing the cache under `key`; the cache when the network is down. */
async function networkFirst(request, key) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!handledByThisWorker(url)) return;

  if (request.mode === 'navigate') {
    // A full load of a payload's address happens when the router's fetch of it
    // failed: send the cashier to the screen itself.
    if (url.pathname.endsWith('/index.txt')) {
      event.respondWith(Response.redirect(new URL(routeOf(url.pathname), self.location.origin).href, 302));
      return;
    }
    // Each screen from its own page, with the order screen as the last resort.
    // A shell that names chunks a deploy has replaced would fail to boot, so
    // the network comes first when there is one.
    const route = routeOf(url.pathname);
    event.respondWith(
      networkFirst(request, route).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        const fallback = await cache.match(SHELL_URL);
        if (fallback) return fallback;
        throw new Error('offline and no cached shell');
      }),
    );
    return;
  }

  if (isPayload(url)) {
    // Keyed by address, not by the router's cache-busting `_rsc` query.
    event.respondWith(networkFirst(request, url.pathname));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        // This build's file, or the build before's for a page still running it.
        const cached = (await cache.match(request)) ?? (await caches.match(request));
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
