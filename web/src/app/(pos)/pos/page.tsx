'use client';

import { OrderEntryScreen } from '@/features/pos/OrderEntryScreen';

/**
 * Order entry — the cashier's home. Client-only, reads from IndexedDB through
 * the provider; no fetch on this path.
 */
export default function PosHome() {
  return <OrderEntryScreen />;
}
