import Link from 'next/link';

import { PageHeader } from '@/components/admin/PageHeader';
import { StatTile } from '@/components/admin/StatTile';
import { formatCount, formatPaise } from '@/lib/admin/format';
import { adminServerGet } from '@/lib/admin/server';
import type { Stats } from '@/lib/admin/types';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const LOW_STOCK_HREF = '/admin/inventory?belowThreshold=true';

function GstPlaceholderBanner() {
  return (
    <div className="admin-banner" role="status" data-testid="gst-placeholder-banner">
      <span>
        GST profile is a placeholder — invoices will carry a dummy GSTIN until it is replaced.
      </span>
      <Link href="/admin/settings?tab=gst_profile">Update it in Settings</Link>
    </div>
  );
}

function StatGrid({ stats }: { readonly stats: Stats }) {
  return (
    <ul className="admin-stats" aria-label="Key figures">
      <StatTile label="Orders today" value={formatCount(stats.ordersToday)} />
      <StatTile label="Orders, 7 days" value={formatCount(stats.orders7d)} />
      <StatTile label="Revenue today" value={formatPaise(stats.revenueTodayPaise)} />
      <StatTile label="Revenue, 7 days" value={formatPaise(stats.revenue7dPaise)} />
      <StatTile label="Active products" value={formatCount(stats.productsActive)} />
      <StatTile
        label="Low stock"
        value={formatCount(stats.lowStockCount)}
        hint="Variants at or below their threshold"
        href={LOW_STOCK_HREF}
        tone={stats.lowStockCount > 0 ? 'warning' : 'default'}
        testId="stat-low-stock"
      />
      <StatTile label="Pending returns" value={formatCount(stats.pendingReturns)} />
      <StatTile label="Customers" value={formatCount(stats.customersTotal)} />
    </ul>
  );
}

export default async function AdminHomePage() {
  const [session, stats] = await Promise.all([getSession(), adminServerGet<Stats>('/admin/stats')]);

  return (
    <>
      <PageHeader title="Dashboard" />
      <p className="admin-muted" data-testid="admin-session" style={{ margin: '0 0 1rem' }}>
        Signed in as {session?.role ?? '—'}.
      </p>
      {stats.ok && stats.data.gstProfileIsPlaceholder && <GstPlaceholderBanner />}
      {stats.ok ? (
        <StatGrid stats={stats.data} />
      ) : (
        <p role="alert" className="admin-error">
          Could not load statistics ({stats.code}). Refresh to try again.
        </p>
      )}
    </>
  );
}
