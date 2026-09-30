import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { SecurityPage as SecurityContent } from '@/components/account/SecurityPage';
import { apiGet } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Security' };

interface SecurityPageProps {
  readonly params: Promise<{ locale: string }>;
}

interface SessionData {
  readonly id: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

export default async function SecurityPage({ params }: SecurityPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  let sessions: readonly SessionData[] = [];
  let email = '';

  const [sessionsResult, profileResult] = await Promise.allSettled([
    apiGet<{ sessions: readonly SessionData[] }>('/account/sessions', { auth: true }),
    apiGet<{ user: { email: string } }>('/auth/me', { auth: true }),
  ]);

  if (sessionsResult.status === 'fulfilled') {
    sessions = (sessionsResult.value.data).sessions;
  }
  if (profileResult.status === 'fulfilled') {
    email = ((profileResult.value.data).user.email);
  }

  return (
    <SecurityContent
      sessions={sessions}
      currentSessionId=""
      email={email}
    />
  );
}
