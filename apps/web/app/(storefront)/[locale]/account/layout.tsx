import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AccountNav } from '@/components/account/AccountNav';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = { title: 'Account' };

interface AccountLayoutProps {
  readonly children: ReactNode;
}

export default async function AccountLayout({ children }: AccountLayoutProps) {
  const session = await getSession();
  if (session === null) redirect('/login?redirect=/account');

  return (
    <section className="page" style={{ maxWidth: 'var(--content-max)', margin: '0 auto', padding: 'var(--gutter)' }}>
      <h1 style={{ fontSize: 'var(--text-h2)', marginBottom: 'var(--space-3)' }}>Your account</h1>
      <AccountNav />
      {children}
    </section>
  );
}
