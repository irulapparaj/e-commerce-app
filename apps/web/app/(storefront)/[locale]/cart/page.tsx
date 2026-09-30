import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CartPageClient } from '@/components/cart/CartPage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('cart');
  return {
    title: t('pageTitle'),
    description: t('pageDescription'),
  };
}

export default function CartPage() {
  return <CartPageClient />;
}
