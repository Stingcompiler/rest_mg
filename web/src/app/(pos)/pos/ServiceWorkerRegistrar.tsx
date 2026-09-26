'use client';

import { useEffect } from 'react';

/**
 * Registers the cashier service worker with a scope of `/pos/`.
 *
 * The worker is served from the root so it can be updated independently of the
 * app shell, and claims only `/pos/`. `/manager`, `/r` and `/api` are never
 * intercepted: the manager dashboard is an online product and must not be
 * served a stale shell, and a cached API response would be indistinguishable
 * from a fresh one.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/pos-sw.js', { scope: '/pos/' }).catch((error) => {
      // Registration failing means no offline shell — worth knowing about, but
      // never worth blocking the till.
      console.error('[pos] service worker registration failed', error);
    });
  }, []);

  return null;
}
