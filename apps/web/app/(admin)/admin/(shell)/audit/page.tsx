import type { Metadata } from 'next';

import { AuditFilters } from '@/components/admin/audit/AuditFilters';
import { AuditTable } from '@/components/admin/audit/AuditTable';
import { NotPermitted } from '@/components/admin/NotPermitted';
import { PageHeader } from '@/components/admin/PageHeader';
import { AUDIT_FILTER_KEYS } from '@/lib/admin/filter-keys';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';
import type { AuditRow } from '@/lib/admin/types';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit Log' };

const PAGE_LIMIT = 20;
/** The console is India-only: date filters are interpreted as whole IST days. */
const IST_OFFSET = '+05:30';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dayStart = (date: string | undefined) =>
  date !== undefined && DATE_ONLY.test(date)
    ? new Date(`${date}T00:00:00${IST_OFFSET}`).toISOString()
    : date;
const dayEnd = (date: string | undefined) =>
  date !== undefined && DATE_ONLY.test(date)
    ? new Date(`${date}T23:59:59.999${IST_OFFSET}`).toISOString()
    : date;

interface AuditPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const session = await getSession();
  if (session?.role !== 'ADMIN') return <NotPermitted role={session?.role} />;

  const params = await searchParams;
  const filters = pickParams(params, AUDIT_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const query = buildQuery({
    ...filters,
    from: dayStart(filters.from),
    to: dayEnd(filters.to),
    page,
    limit: PAGE_LIMIT,
  });
  const result = await adminServerGet<readonly AuditRow[]>(`/admin/audit${query}`);

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Append-only record of every admin write. Select a row to compare before and after."
      />
      <AuditFilters initial={filters} />
      {result.ok ? (
        <AuditTable
          rows={result.data}
          pagination={result.meta ?? { page, limit: PAGE_LIMIT, total: result.data.length }}
          filters={filters}
        />
      ) : (
        <p role="alert" className="admin-error">
          Could not load the audit log ({result.code}).
        </p>
      )}
    </>
  );
}
