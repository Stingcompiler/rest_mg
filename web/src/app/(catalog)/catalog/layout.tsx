import type { Metadata } from 'next';

import { t } from '@/i18n';
import { QueryProvider } from '@/features/manager/QueryProvider';
import { RequireRole } from '@/features/auth/RequireRole';

export const metadata: Metadata = {
  title: t('catalog.title'),
};

/**
 * Catalogue management is its own surface, shared by the two roles the server's
 * IsCatalogEditor admits: the manager/owner and the cashier. It is online (the
 * authoritative menu lives in the database), so it carries TanStack Query like
 * the manager area — but its own guard widens the audience to the cashier.
 */
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['owner', 'manager', 'cashier']}>
      <QueryProvider>{children}</QueryProvider>
    </RequireRole>
  );
}
