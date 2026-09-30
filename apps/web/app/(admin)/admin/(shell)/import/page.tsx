import type { Metadata } from 'next';
import Link from 'next/link';

import { HistoryTable } from '@/components/admin/import/HistoryTable';
import { UploadCard } from '@/components/admin/import/UploadCard';
import { PageHeader } from '@/components/admin/PageHeader';
import type { ImportJobDto } from '@/lib/admin/import-types';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import / Export' };

const PAGE_LIMIT = 20;

interface ImportPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const page = parsePage(pickParams(params, ['page']).page);
  const [session, history] = await Promise.all([
    getSession(),
    adminServerGet<readonly ImportJobDto[]>(
      `/admin/import${buildQuery({ page, limit: PAGE_LIMIT })}`,
    ),
  ]);
  const role = session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF';

  return (
    <>
      <PageHeader
        title="Import / Export"
        description="Load the catalogue from a spreadsheet with a dry run first; export products, orders and customers as CSV."
        actions={
          <>
            <Link
              href="/admin/import/images"
              className="admin-btn"
              data-testid="import-images-link"
            >
              Bulk image upload
            </Link>
            <Link href="/admin/export" className="admin-btn" data-testid="export-link">
              Exports
            </Link>
          </>
        }
      />
      <UploadCard role={role} />
      <section className="admin-section" aria-labelledby="history-heading">
        <h2 id="history-heading" className="admin-section-title">
          Import history
        </h2>
        {history.ok ? (
          <HistoryTable
            rows={history.data}
            pagination={history.meta ?? { page, limit: PAGE_LIMIT, total: history.data.length }}
          />
        ) : (
          <p role="alert" className="admin-error">
            Could not load the import history ({history.code}).
          </p>
        )}
      </section>
    </>
  );
}
