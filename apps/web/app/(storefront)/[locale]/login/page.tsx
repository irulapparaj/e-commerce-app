import { DEFAULT_REDIRECT, validateRedirect } from '@pe/shared';
import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { LoginForm } from '@/components/auth/LoginForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Sign in' };

interface LoginPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ redirect?: string | string[] }>;
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { redirect } = await searchParams;
  const redirectTo = validateRedirect(
    Array.isArray(redirect) ? redirect[0] : redirect,
    DEFAULT_REDIRECT.customer,
  );

  return (
    <main className="page" aria-labelledby="login-heading" style={{ maxWidth: '28rem' }}>
      <h1 id="login-heading">Sign in</h1>
      <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
        No password needed. We will email you a one-time code.
      </p>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <LoginForm redirectTo={redirectTo} />
      </div>
    </main>
  );
}
