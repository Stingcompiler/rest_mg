import type { Metadata } from 'next';

import { t } from '@/i18n';
import { RequireRole } from '@/features/auth/RequireRole';

export const metadata: Metadata = {
  title: t('kitchen.title'),
};

/** Kitchen staff only — a manager or owner may also look at the pass. */
export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return <RequireRole allow={['kitchen', 'manager', 'owner']}>{children}</RequireRole>;
}
