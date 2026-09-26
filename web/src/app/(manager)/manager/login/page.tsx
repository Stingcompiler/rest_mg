'use client';

import { useEffect } from 'react';

/**
 * Superseded by the single sign-in at /login, which routes by role. Kept so an
 * old bookmark still lands somewhere useful.
 */
export default function ManagerLoginRedirect() {
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.replace(next ? `/login/?next=${encodeURIComponent(next)}` : '/login/');
  }, []);
  return null;
}
