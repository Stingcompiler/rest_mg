import type { Metadata } from 'next';

import { ProductLanding } from '@/features/product/ProductLanding';

/**
 * The home page is Orderak itself, for the buyer: what the system does for a
 * restaurant (batch 68). A restaurant's own public page is at `/r/<slug>/`;
 * staff reach their apps by signing in at `/login`.
 */
export const metadata: Metadata = {
  // The root layout's template does not apply to its own segment's page.
  title: { absolute: 'اوردراك — نظام طلبات وكاشير ومطبخ للمطاعم' },
  description:
    'اوردراك يستقبل الطلبات من الموقع والكاشير ويرسلها إلى المطبخ، ويرصد المبيعات والذمم في مكان واحد، ويعمل حتى بلا إنترنت.',
  openGraph: {
    title: 'اوردراك — نظام طلبات وكاشير ومطبخ للمطاعم',
    description: 'يستقبل الطلبات، ويرسلها إلى المطبخ، ويرصد المبيعات والذمم. ويعمل حتى بلا إنترنت.',
    type: 'website',
    locale: 'ar_AR',
  },
};

export default function HomePage() {
  return <ProductLanding />;
}
