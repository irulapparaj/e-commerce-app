'use client';

import { IMAGES_PER_PRODUCT_MAX } from '@pe/shared';
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

import { IMAGE_ACCEPT, pollJob, presignAndUpload, validateImageFile } from '@/lib/admin/upload';

interface ImageUploaderProps {
  readonly presignPath: string;
  readonly confirmPath: string;
  readonly currentCount: number;
  readonly onUploaded: () => void | Promise<void>;
  readonly max?: number;
  readonly multiple?: boolean;
  /** Product confirms take `alt`; category confirms reject it. */
  readonly withAlt?: boolean;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly pollIntervalMs?: number;
}

type UploadState = 'uploading' | 'processing' | 'done' | 'failed';

interface UploadItem {
  readonly id: number;
  readonly name: string;
  readonly progress: number;
  readonly state: UploadState;
  readonly error: string | null;
}

const PERCENT = 100;
const STATE_LABEL: Readonly<Record<UploadState, string>> = {
  uploading: 'Uploading',
  processing: 'Processing',
  done: 'Ready',
  failed: 'Failed',
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : 'Upload failed';

const capMessage = (remaining: number, max: number): string =>
  remaining <= 0
    ? `This product already has the maximum of ${max} images.`
    : `Only ${remaining} more image${remaining === 1 ? '' : 's'} can be added (maximum ${max}).`;

/** Direct-to-bucket uploads with per-file progress; the API only presigns, confirms and reports jobs. */
export function ImageUploader({
  presignPath,
  confirmPath,
  currentCount,
  onUploaded,
  max = IMAGES_PER_PRODUCT_MAX,
  multiple = true,
  withAlt = true,
  disabled = false,
  label = 'Add images',
  pollIntervalMs,
}: ImageUploaderProps) {
  const [items, setItems] = useState<readonly UploadItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const sequence = useRef(0);
  const inputId = `uploader-${presignPath.replace(/[^a-z0-9]+/gi, '-')}`;

  const patch = (id: number, changes: Partial<UploadItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const run = async (id: number, file: File) => {
    try {
      const { jobId } = await presignAndUpload({
        presignPath,
        confirmPath,
        file,
        ...(withAlt ? { alt: '' } : {}),
        onProgress: (fraction) => patch(id, { progress: fraction }),
      });
      patch(id, { state: 'processing', progress: 1 });
      await pollJob(jobId, pollIntervalMs === undefined ? {} : { intervalMs: pollIntervalMs });
      patch(id, { state: 'done' });
      await onUploaded();
    } catch (error) {
      patch(id, { state: 'failed', error: messageOf(error) });
    }
  };

  const accept = (files: readonly File[]) => {
    if (files.length === 0) return;
    const inFlight = items.filter((item) => item.state !== 'done' && item.state !== 'failed');
    const remaining = max - currentCount - inFlight.length;
    setNotice(files.length > remaining ? capMessage(remaining, max) : null);
    const queued = files.slice(0, Math.max(0, remaining)).map((file) => {
      sequence.current += 1;
      const invalid = validateImageFile(file);
      const item: UploadItem = {
        id: sequence.current,
        name: file.name,
        progress: 0,
        state: invalid === null ? 'uploading' : 'failed',
        error: invalid,
      };
      return { item, file, invalid };
    });
    setItems((prev) => [...prev, ...queued.map((entry) => entry.item)]);
    for (const entry of queued) if (entry.invalid === null) void run(entry.item.id, entry.file);
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    accept(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!disabled) accept(Array.from(event.dataTransfer.files));
  };

  return (
    <div data-testid="image-uploader">
      <div
        className="admin-dropzone"
        data-active={dragActive ? 'true' : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
      >
        <label htmlFor={inputId} className="admin-btn">
          {label}
        </label>
        <input
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple={multiple}
          disabled={disabled}
          onChange={onInput}
          className="admin-visually-hidden"
          data-testid="image-input"
        />
        <p className="admin-muted admin-form-status" style={{ margin: 0 }}>
          Drop JPEG, PNG, WebP or AVIF files here — up to 10 MB each, {max} per product.
        </p>
      </div>
      {notice !== null && (
        <p className="admin-error" role="alert" data-testid="uploader-notice">
          {notice}
        </p>
      )}
      {items.length > 0 && (
        <ul className="admin-upload-rows" aria-label="Uploads">
          {items.map((item) => (
            <li key={item.id} className="admin-upload-row" data-testid="upload-row">
              <span>{item.name}</span>
              <span className="admin-muted" data-testid="upload-state">
                {STATE_LABEL[item.state]}
              </span>
              {item.state !== 'failed' && (
                <div
                  className="admin-progress"
                  role="progressbar"
                  aria-label={`Uploading ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={PERCENT}
                  aria-valuenow={Math.round(item.progress * PERCENT)}
                >
                  <div
                    className="admin-progress-bar"
                    style={{ transform: `scaleX(${item.progress})` }}
                  />
                </div>
              )}
              {item.error !== null && (
                <p className="admin-error" role="alert">
                  {item.error}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
