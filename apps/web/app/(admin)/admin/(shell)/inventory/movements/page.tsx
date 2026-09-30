import type { Metadata } from 'next';
import Link from 'next/link';

import { LedgerTable } from '@/components/admin/inventory/LedgerTable';
import { PageHeader } from '@/components/admin/PageHeader';
import type { MovementRow } from '@/lib/admin/catalogue-types';
import { LEDGER_FILTER_KEYS } from '@/lib/admin/filter-keys';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stock movements' };

const PAGE_LIMIT = 25;
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

interface MovementsPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MovementsPage({ searchParams }: MovementsPageProps) {
  const params = await searchParams;
  const filters = pickParams(params, LEDGER_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const query = buildQuery({
    ...filters,
    from: dayStart(filters.from),
    to: dayEnd(filters.to),
    page,
    limit: PAGE_LIMIT,
  });
  const result = await adminServerGet<readonly MovementRow[]>(`/admin/inventory/movements${query}`);
  if (!result.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load the ledger ({result.code}).
      </p>
    );
  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Append-only ledger: the cached stock of every variant is the sum of these rows."
        actions={
          <Link href="/admin/inventory" className="admin-btn">
            Back to stock
          </Link>
        }
      />
      <LedgerTable
        rows={result.data}
        pagination={result.meta ?? { page, limit: PAGE_LIMIT, total: result.data.length }}
        filters={filters}
      />
    </>
  );
}
