import { DEFAULT_REDIRECT, validateRedirect, brand } from '@pe/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { LoginCard } from '@/components/auth/LoginCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('title') };
}

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
    <div
      style={{
        minHeight: 'calc(100vh - var(--header-height))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--gutter)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '28rem' }}>
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-5)' }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-h2)',
              fontWeight: '600',
              letterSpacing: '-0.02em',
            }}
          >
            {brand.name}
          </p>
        </div>
        <LoginCard redirectTo={redirectTo} />
      </div>
    </div>
  );
}
