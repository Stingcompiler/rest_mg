import type { Metadata } from 'next';

import { t } from '@/i18n';
import { QueryProvider } from '@/features/manager/QueryProvider';
import { RequireRole } from '@/features/auth/RequireRole';

export const metadata: Metadata = {
  title: t('deliveries.title'),
};

/**
 * Delivery-order processing, shared by the roles the server's IsOrderProcessor
 * admits — owner, manager, cashier. Online like the catalogue, so it carries
 * TanStack Query; its own guard widens the audience to the cashier.
 */
export default function DeliveriesLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['owner', 'manager', 'cashier']}>
      <QueryProvider>{children}</QueryProvider>
    </RequireRole>
  );
}
