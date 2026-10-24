import type { Metadata } from 'next';

import { ProductLanding } from '@/features/product/ProductLanding';

/**
 * Orderak as a product, for the owner of a restaurant: `/orderak/`. The site
 * root stays the restaurant's own public page. Public and indexable; the
 * server lists it in the sitemap.
 */
export const metadata: Metadata = {
  title: 'نظام طلبات وكاشير ومطبخ للمطاعم',
  description:
    'اوردراك يستقبل الطلبات من الموقع والكاشير ويرسلها إلى المطبخ، ويرصد المبيعات والذمم في مكان واحد، ويعمل حتى بلا إنترنت.',
  openGraph: {
    title: 'اوردراك — نظام طلبات وكاشير ومطبخ للمطاعم',
    description: 'يستقبل الطلبات، ويرسلها إلى المطبخ، ويرصد المبيعات والذمم. ويعمل حتى بلا إنترنت.',
    type: 'website',
    locale: 'ar_AR',
  },
};

export default function OrderakProductPage() {
  return <ProductLanding />;
}
