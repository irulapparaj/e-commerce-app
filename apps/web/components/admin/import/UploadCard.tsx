'use client';

import { IMPORT_MAX_ROWS } from '@pe/shared';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type DragEvent, useState } from 'react';

import { isAdminApiError } from '@/lib/admin/api';
import { requestImportStep } from '@/lib/admin/import-poll';
import { importTemplateHref } from '@/lib/admin/import-types';
import { IMPORT_ACCEPT, uploadImportFile, validateImportFile } from '@/lib/admin/import-upload';

import type { AdminRole } from '../Nav.config';

interface UploadCardProps {
  readonly role: AdminRole;
}

type Phase = 'idle' | 'uploading' | 'queueing';

const PERCENT = 100;
const ADMIN_ONLY =
  'Uploading a spreadsheet is Admin only; Staff can download the template and export.';

const messageOf = (error: unknown): string =>
  isAdminApiError(error) || error instanceof Error ? error.message : 'Upload failed';

/**
 * Template links, drop zone and client checks (P07 task 7). After the PUT the validate job is
 * queued and the browser moves to the job page, which polls until the dry run is ready.
 */
export function UploadCard({ role }: UploadCardProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const canUpload = role === 'ADMIN' && phase === 'idle';

  const run = async (file: File) => {
    setPhase('uploading');
    setProgress(0);
    try {
      const job = await uploadImportFile({ file, onProgress: setProgress });
      setPhase('queueing');
      const queueJobId = await requestImportStep(job.id, 'validate');
      router.push(`/admin/import/${job.id}?job=${encodeURIComponent(queueJobId)}`);
    } catch (caught) {
      setError(messageOf(caught));
      setPhase('idle');
    }
  };

  const accept = (files: readonly File[]) => {
    const file = files[0];
    if (file === undefined || !canUpload) return;
    setError(null);
    setFileName(file.name);
    const check = validateImportFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    void run(file);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    accept(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    accept(Array.from(event.dataTransfer.files));
  };

  return (
    <section className="admin-panel admin-import-card" aria-labelledby="upload-heading">
      <h2 id="upload-heading" className="admin-panel-title">
        Import products
      </h2>
      <p className="admin-import-lead">
        Download the template, fill one row per variant (rows sharing a SKU form one product), then
        upload it. Nothing changes until you review the dry run and apply it.
      </p>
      <p className="admin-template-links">
        <a
          href={importTemplateHref('csv')}
          download
          className="admin-btn admin-btn-small"
          data-testid="import-template-csv"
        >
          Template (.csv)
        </a>
        <a
          href={importTemplateHref('xlsx')}
          download
          className="admin-btn admin-btn-small"
          data-testid="import-template-xlsx"
        >
          Template (.xlsx)
        </a>
      </p>
      <div
        className="admin-dropzone"
        data-active={dragActive ? 'true' : undefined}
        data-disabled={canUpload ? undefined : 'true'}
        onDragOver={(event) => {
          event.preventDefault();
          if (canUpload) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        data-testid="import-dropzone"
      >
        <label htmlFor="import-file" className="admin-btn admin-btn-primary">
          Choose a file
        </label>
        <input
          id="import-file"
          type="file"
          accept={IMPORT_ACCEPT}
          disabled={!canUpload}
          onChange={onInput}
          className="admin-visually-hidden"
          data-testid="import-file-input"
        />
        <p className="admin-muted admin-form-status admin-import-hint">
          Drop a .csv or .xlsx here — up to 5 MB and {IMPORT_MAX_ROWS.toLocaleString('en-IN')} rows.
        </p>
      </div>
      {role !== 'ADMIN' && (
        <p className="admin-muted admin-form-status" data-testid="import-admin-only">
          {ADMIN_ONLY}
        </p>
      )}
      {phase !== 'idle' && fileName !== null && (
        <div className="admin-upload-row admin-import-progress" data-testid="import-progress">
          <span>{fileName}</span>
          <span className="admin-muted" data-testid="import-upload-state">
            {phase === 'uploading' ? 'Uploading' : 'Queueing dry run'}
          </span>
          <div
            className="admin-progress"
            role="progressbar"
            aria-label={`Uploading ${fileName}`}
            aria-valuemin={0}
            aria-valuemax={PERCENT}
            aria-valuenow={Math.round(progress * PERCENT)}
          >
            <div className="admin-progress-bar" style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>
      )}
      {error !== null && (
        <p className="admin-error" role="alert" data-testid="import-error">
          {fileName === null ? '' : `${fileName}: `}
          {error}
        </p>
      )}
    </section>
  );
}
