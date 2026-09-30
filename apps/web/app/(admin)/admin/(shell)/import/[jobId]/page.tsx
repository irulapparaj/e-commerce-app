import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ImportJobPanel } from '@/components/admin/import/ImportJobPanel';
import type { ImportJobDto } from '@/lib/admin/import-types';
import { pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import dry run' };

const NOT_FOUND = 404;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** pg-boss job ids are UUIDs too; anything else in `?job=` is ignored rather than polled. */
const JOB_ID = /^[0-9a-f-]{36}$/i;

interface ImportJobPageProps {
  readonly params: Promise<{ jobId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportJobPage({ params, searchParams }: ImportJobPageProps) {
  const { jobId } = await params;
  if (!UUID.test(jobId)) notFound();
  const queue = pickParams(await searchParams, ['job']).job;
  const [session, job] = await Promise.all([
    getSession(),
    adminServerGet<ImportJobDto>(`/admin/import/${jobId}`),
  ]);
  if (!job.ok && job.status === NOT_FOUND) notFound();
  if (!job.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load the import ({job.code}).
      </p>
    );
  return (
    <ImportJobPanel
      initial={job.data}
      queueJobId={queue !== undefined && JOB_ID.test(queue) ? queue : null}
      role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
    />
  );
}
