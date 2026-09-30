import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { CheckoutPage } from '@/components/checkout/CheckoutPage';
import { apiGet } from '@/lib/api/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

interface AccountProfile {
  readonly email: string;
  readonly phone: string | null;
}

interface CheckoutPageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function CheckoutRoute({ params }: CheckoutPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session === null || session.aud !== 'storefront') {
    redirect(`/${locale}/login?next=/${locale}/checkout`);
  }

  let email = '';
  let phone = '';
  try {
    const profile = await apiGet<AccountProfile>('/account/profile', { auth: true });
    email = profile.data.email;
    phone = profile.data.phone ?? '';
  } catch {
    // account profile unavailable; checkout still works with empty contact
  }

  return <CheckoutPage email={email} phone={phone} />;
}
