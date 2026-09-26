import { LandingClient } from '@/features/landing/LandingClient';

/**
 * Public landing route. A static export needs a param list for a dynamic
 * segment, so one placeholder shell is emitted; Django serves it for every
 * `/r/<slug>`, and the client reads the real slug and fetches. That is why any
 * restaurant works at runtime without a rebuild.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return [{ slug: '_' }];
}

export default function PublicLandingPage() {
  return <LandingClient />;
}
