import type { Metadata } from 'next';

import { NotPermitted } from '@/components/admin/NotPermitted';
import { PageHeader } from '@/components/admin/PageHeader';
import { SessionsTable } from '@/components/admin/security/SessionsTable';
import { StatTile } from '@/components/admin/StatTile';
import { formatCount } from '@/lib/admin/format';
import { adminServerGet } from '@/lib/admin/server';
import type { SecurityOverview, WebhookProvider } from '@/lib/admin/types';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security & Health' };

const PROVIDERS: readonly WebhookProvider[] = ['RAZORPAY', 'SHIPROCKET', 'EMAIL'];

const warnIf = (value: number) => (value > 0 ? 'warning' : 'default');

function Counters({ overview }: { readonly overview: SecurityOverview }) {
  return (
    <ul className="admin-stats" aria-label="Last 24 hours">
      <StatTile
        label="Failed logins, 24h"
        value={formatCount(overview.failedLogins24h)}
        tone={warnIf(overview.failedLogins24h)}
        testId="stat-failed-logins"
      />
      <StatTile
        label="MFA failures, 24h"
        value={formatCount(overview.mfaFailures24h)}
        tone={warnIf(overview.mfaFailures24h)}
      />
      {PROVIDERS.map((provider) => (
        <StatTile
          key={provider}
          label={`${provider} webhook failures, 24h`}
          value={formatCount(overview.webhookFailures24h[provider])}
          tone={warnIf(overview.webhookFailures24h[provider])}
          testId={`stat-webhook-${provider}`}
        />
      ))}
      <StatTile
        label="Ledger drift, 24h"
        value={formatCount(overview.ledgerDrift24h)}
        hint="Variants whose stock disagrees with the movement ledger"
        tone={warnIf(overview.ledgerDrift24h)}
      />
      <StatTile label="Reconciliation mismatches" value="—" hint="Arrives with P25" />
    </ul>
  );
}

export default async function SecurityPage() {
  const session = await getSession();
  if (session?.role !== 'ADMIN') return <NotPermitted role={session?.role} />;

  const overview = await adminServerGet<SecurityOverview>('/admin/security');

  return (
    <>
      <PageHeader
        title="Security & Health"
        description="Active admin sessions and the last 24 hours of failures."
      />
      {overview.ok ? (
        <>
          <Counters overview={overview.data} />
          <section className="admin-section" aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="admin-section-title">
              Active admin sessions
            </h2>
            <SessionsTable rows={overview.data.adminSessions} />
          </section>
        </>
      ) : (
        <p role="alert" className="admin-error">
          Could not load the security overview ({overview.code}).
        </p>
      )}
    </>
  );
}
