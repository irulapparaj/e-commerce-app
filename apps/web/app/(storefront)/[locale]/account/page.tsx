import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

interface AccountPageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();

  return (
    <main className="page" aria-labelledby="account-heading">
      <h1 id="account-heading">Your account</h1>
      <p className="muted" style={{ marginTop: 'var(--space-1)' }} data-testid="session-user">
        Signed in as {session?.userId ?? 'unknown'} ({session?.role ?? '—'}). Orders, addresses and
        security settings arrive with plan P15.
      </p>
      <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-1)' }}>
        <SignOutButton redirectTo="/" />
        <SignOutButton redirectTo="/" everywhere />
      </div>
    </main>
  );
}
