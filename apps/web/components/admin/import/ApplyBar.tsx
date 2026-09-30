'use client';

import { useState } from 'react';

import { isAdminApiError } from '@/lib/admin/api';
import { formatCount, formatDateTime } from '@/lib/admin/format';
import { requestImportStep } from '@/lib/admin/import-poll';
import type { ImportJobDto, ImportStatus } from '@/lib/admin/import-types';

import type { AdminRole } from '../Nav.config';

interface ApplyBarProps {
  readonly job: ImportJobDto;
  readonly role: AdminRole;
  /** True while the page is waiting on a validate or apply job. */
  readonly working: boolean;
  readonly workingLabel?: string;
  readonly onQueued: (queueJobId: string) => void;
}

export const CANCELLED_MESSAGE = 'Confirmation was cancelled; nothing was applied.';
export const ADMIN_ONLY_MESSAGE = 'Applying an import is Admin only.';

const STATUS_CLASS: Readonly<Record<ImportStatus, string>> = {
  UPLOADED: 'admin-badge',
  VALIDATED: 'admin-badge admin-badge-success',
  APPLIED: 'admin-badge admin-badge-success',
  FAILED: 'admin-badge admin-badge-critical',
};

/** The API refuses apply unless VALIDATED with zero errors; the button mirrors that exactly. */
export const canApply = (job: ImportJobDto): boolean =>
  job.status === 'VALIDATED' && job.errorRows === 0;

const explain = (job: ImportJobDto, role: AdminRole): string | null => {
  if (job.status === 'APPLIED') return `Applied ${formatDateTime(job.appliedAt)}.`;
  if (job.status === 'UPLOADED') return 'Run the dry run first.';
  if (job.status === 'FAILED')
    return job.error ?? 'The dry run found row problems; fix the sheet and upload it again.';
  if (job.errorRows > 0) return 'Row problems must be fixed before this file can be applied.';
  return role === 'ADMIN' ? null : ADMIN_ONLY_MESSAGE;
};

/** Status, counts and the step-up-guarded apply (`POST /admin/import/:id/apply`, ADMIN ⚡). */
export function ApplyBar({ job, role, working, workingLabel, onQueued }: ApplyBarProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = canApply(job) && role === 'ADMIN' && !working && !busy;
  const explanation = explain(job, role);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      onQueued(await requestImportStep(job.id, 'apply'));
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not start the import. Try again.');
      else setError(caught.code === 'STEP_UP_REQUIRED' ? CANCELLED_MESSAGE : caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-apply-bar" data-testid="apply-bar">
      <div className="admin-apply-status">
        <span className={STATUS_CLASS[job.status]} data-testid="import-status">
          {job.status}
        </span>
        {working && (
          <span className="admin-muted" role="status" data-testid="import-working">
            {workingLabel ?? 'Working…'}
          </span>
        )}
        {job.summary !== null && (
          <dl className="admin-import-summary" aria-label="Dry-run counts">
            <div>
              <dt>Rows</dt>
              <dd className="admin-tabular" data-testid="import-summary-rows">
                {formatCount(job.totalRows)}
              </dd>
            </div>
            <div>
              <dt>Creates</dt>
              <dd className="admin-tabular" data-testid="import-summary-creates">
                {formatCount(job.summary.creates)}
              </dd>
            </div>
            <div>
              <dt>Updates</dt>
              <dd className="admin-tabular" data-testid="import-summary-updates">
                {formatCount(job.summary.updates)}
              </dd>
            </div>
            <div>
              <dt>Stock changes</dt>
              <dd className="admin-tabular">{formatCount(job.summary.stockDeltas)}</dd>
            </div>
            <div>
              <dt>Errors</dt>
              <dd
                className={job.errorRows > 0 ? 'admin-tabular admin-error' : 'admin-tabular'}
                data-testid="import-summary-errors"
              >
                {formatCount(job.errorRows)}
              </dd>
            </div>
          </dl>
        )}
      </div>
      <div className="admin-apply-actions">
        {explanation !== null && (
          <p className="admin-muted admin-form-status" data-testid="apply-explanation">
            {explanation}
          </p>
        )}
        {job.status !== 'APPLIED' && (
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => void apply()}
            disabled={!enabled}
            data-testid="import-apply"
          >
            {busy ? 'Starting…' : 'Apply import'}
          </button>
        )}
        {error !== null && (
          <p role="alert" className="admin-error" data-testid="apply-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
