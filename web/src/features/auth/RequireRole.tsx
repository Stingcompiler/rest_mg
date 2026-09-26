'use client';

/**
 * The route guard. Sends an unauthenticated visitor to sign in, and a signed-in
 * one who has wandered into the wrong app back to their own.
 *
 * A cook who opens `/manager` lands on the kitchen board, not an error — the
 * point is to get people to their own screen, not to scold them.
 */
import { useEffect } from 'react';

import { useI18n } from '@/i18n';
import type { StaffRole } from '@/lib/http';
import { homeForRole, useAuth } from './AuthProvider';

export function RequireRole({
  allow,
  children,
}: {
  allow: StaffRole[];
  children: React.ReactNode;
}) {
  const { user, loading, unauthenticated } = useAuth();
  const i18n = useI18n();
  const permitted = user !== null && allow.includes(user.role);

  useEffect(() => {
    if (loading) return;
    if (typeof window === 'undefined') return;

    if (!user) {
      const next = encodeURIComponent(window.location.pathname);
      window.location.assign(`/login/?next=${next}`);
      return;
    }
    if (!permitted) window.location.assign(homeForRole(user.role));
  }, [loading, user, permitted, unauthenticated]);

  if (loading || !permitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text">
        <span className="text-ar-base text-text-muted">{i18n.t('common.retry')}</span>
      </div>
    );
  }
  return <>{children}</>;
}
