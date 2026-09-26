import type { Metadata } from 'next';

import { t } from '@/i18n';
import { PosProvider } from '@/features/pos/PosProvider';
import { RequireRole } from '@/features/auth/RequireRole';

import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: t('pos.title'),
};

/**
 * The cashier shell.
 *
 * This is a server component and it will stay one — but it holds **no data
 * access of any kind**. It renders a static frame so the service worker can
 * cache the whole thing and serve it with the network switched off; everything
 * below it is `'use client'` and reads from IndexedDB.
 *
 * `force-static` is the guarantee, not a hint: if someone later adds a fetch or
 * a dynamic API here, the build fails instead of quietly turning the cashier's
 * critical path into a network round trip.
 *
 * The PosProvider wraps every /pos route so the CartSession and Shift survive
 * client navigation between order entry, payment, and shift close — the layout
 * does not remount, so the entities stay live.
 */
export const dynamic = 'force-static';

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <ServiceWorkerRegistrar />
      {/* Each cashier signs in as themselves, so their shift and every order
          they take carry their name. The identity is cached locally, so a
          tablet that signed in this morning keeps working with the line down. */}
      <RequireRole allow={['cashier', 'manager', 'owner']}>
        <PosProvider>{children}</PosProvider>
      </RequireRole>
    </div>
  );
}
