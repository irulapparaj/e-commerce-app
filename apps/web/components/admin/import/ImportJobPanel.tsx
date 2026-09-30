'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { isAdminApiError } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/format';
import { requestImportStep, settleImportStep } from '@/lib/admin/import-poll';
import type { ImportJobDto } from '@/lib/admin/import-types';

import type { AdminRole } from '../Nav.config';
import { PageHeader } from '../PageHeader';
import { useToast } from '../Toast';

import { ApplyBar } from './ApplyBar';
import { DryRunReport } from './DryRunReport';

interface ImportJobPanelProps {
  readonly initial: ImportJobDto;
  /** Queue job id from the upload redirect (`?job=`), polled on mount. */
  readonly queueJobId: string | null;
  readonly role: AdminRole;
  readonly pollIntervalMs?: number;
}

type Phase = 'idle' | 'validating' | 'applying';

const PHASE_LABEL: Readonly<Record<Exclude<Phase, 'idle'>, string>> = {
  validating: 'Running the dry run…',
  applying: 'Applying in one transaction…',
};

const messageOf = (error: unknown, fallback: string): string =>
  isAdminApiError(error) || error instanceof Error ? error.message : fallback;

/** Job page state: waits on validate/apply queue jobs and re-reads the import when they settle. */
export function ImportJobPanel({ initial, queueJobId, role, pollIntervalMs }: ImportJobPanelProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [job, setJob] = useState(initial);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const options = pollIntervalMs === undefined ? {} : { intervalMs: pollIntervalMs };

  const track = async (id: string, next: Exclude<Phase, 'idle'>) => {
    setPhase(next);
    setError(null);
    try {
      const fresh = await settleImportStep(job.id, id, options);
      setJob(fresh);
      if (next === 'applying') {
        if (fresh.status === 'APPLIED') notify('Import applied', 'success');
        else notify(fresh.error ?? 'Import failed; nothing was changed', 'critical');
      }
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught, 'Lost track of the job; refresh to check its status.'));
    } finally {
      setPhase('idle');
    }
  };

  // Mount-only: the redirect from the upload carries the job to watch, and `track` is stable per id.
  useEffect(() => {
    if (started.current || queueJobId === null || initial.status !== 'UPLOADED') return;
    started.current = true;
    void track(queueJobId, 'validating');
  }, []);

  const validate = async () => {
    setError(null);
    try {
      await track(await requestImportStep(job.id, 'validate'), 'validating');
    } catch (caught) {
      setError(messageOf(caught, 'Could not start the dry run.'));
    }
  };

  return (
    <>
      <PageHeader
        title="Import"
        description={`Uploaded ${formatDateTime(job.createdAt)} by ${job.actor.email}.`}
        actions={
          <Link href="/admin/import" className="admin-btn">
            All imports
          </Link>
        }
      />
      <ApplyBar
        job={job}
        role={role}
        working={phase !== 'idle'}
        {...(phase === 'idle' ? {} : { workingLabel: PHASE_LABEL[phase] })}
        onQueued={(id) => void track(id, 'applying')}
      />
      {job.status === 'UPLOADED' && phase === 'idle' && role === 'ADMIN' && (
        <p className="admin-import-validate">
          <button
            type="button"
            className="admin-btn"
            onClick={() => void validate()}
            data-testid="import-validate"
          >
            Run dry run
          </button>
        </p>
      )}
      {error !== null && (
        <p role="alert" className="admin-error" data-testid="import-job-error">
          {error}
        </p>
      )}
      <DryRunReport key={job.status} job={job} />
    </>
  );
}
