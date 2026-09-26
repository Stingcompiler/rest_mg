import type { Metadata } from 'next';

import { t } from '@/i18n';
import { QueryProvider } from '@/features/manager/QueryProvider';
import { RequireRole } from '@/features/auth/RequireRole';

export const metadata: Metadata = {
  title: t('manager.title'),
};

/**
 * The manager dashboard: a client SPA served, like the rest of the frontend, as
 * a static export by Django. TanStack Query provides the data (same-origin
 * API); RequireRole is the auth gate now that there is no edge middleware.
 */
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole allow={['manager', 'owner']}>
      <QueryProvider>{children}</QueryProvider>
    </RequireRole>
  );
}
