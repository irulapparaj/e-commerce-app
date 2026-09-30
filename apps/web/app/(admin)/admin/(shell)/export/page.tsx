import type { Metadata } from 'next';
import Link from 'next/link';

import { ExportPanel } from '@/components/admin/import/ExportPanel';
import { PageHeader } from '@/components/admin/PageHeader';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Exports' };

export default async function ExportPage() {
  const session = await getSession();
  return (
    <>
      <PageHeader
        title="Exports"
        description="Files are generated in the background and download links stay valid for 15 minutes; the files themselves are deleted after 24 hours."
        actions={
          <Link href="/admin/import" className="admin-btn">
            Back to imports
          </Link>
        }
      />
      <ExportPanel role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'} />
    </>
  );
}
