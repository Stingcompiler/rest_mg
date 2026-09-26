'use client';

import { LandingClient } from '@/features/landing/LandingClient';

/**
 * The site root is the public landing page — what a visitor should see. Staff
 * reach their own apps by signing in at /login, which routes them by role.
 */
export default function RootPage() {
  return <LandingClient />;
}
