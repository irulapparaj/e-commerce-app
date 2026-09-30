import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { AddressList } from '@/components/account/AddressList';
import { apiGet } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Addresses' };

interface AddressesPageProps {
  readonly params: Promise<{ locale: string }>;
}

interface Address {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly isDefault: boolean;
}

export default async function AddressesPage({ params }: AddressesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  let addresses: readonly Address[] = [];
  try {
    const result = await apiGet<readonly Address[]>('/account/addresses', { auth: true });
    addresses = result.data;
  } catch {
    // handled below
  }

  return (
    <section aria-labelledby="addresses-heading">
      <h2 id="addresses-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>
        Saved addresses
      </h2>
      <AddressList addresses={addresses} />
    </section>
  );
}
