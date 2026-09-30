'use client';

import { type ChangeEvent, type DragEvent, useRef, useState } from 'react';

import { isAdminApiError } from '@/lib/admin/api';
import {
  IMAGE_NAME_MESSAGE,
  parseImageFilename,
  productImagePaths,
  resolveProductBySku,
} from '@/lib/admin/bulk-images';
import type { AdminProductRow } from '@/lib/admin/catalogue-types';
import { IMAGE_ACCEPT, pollJob, presignAndUpload, validateImageFile } from '@/lib/admin/upload';

export type BulkItemState = 'queued' | 'uploading' | 'processing' | 'done' | 'failed';

export interface BulkItem {
  readonly id: number;
  readonly name: string;
  readonly sku: string | null;
  readonly productName: string | null;
  readonly state: BulkItemState;
  readonly progress: number;
  readonly error: string | null;
}

interface BulkImageUploadProps {
  readonly pollIntervalMs?: number;
}

const PERCENT = 100;
const STATE_LABEL: Readonly<Record<BulkItemState, string>> = {
  queued: 'Queued',
  uploading: 'Uploading',
  processing: 'Processing',
  done: 'Done',
  failed: 'Failed',
};

const messageOf = (error: unknown): string =>
  isAdminApiError(error) || error instanceof Error ? error.message : 'Upload failed';

const unknownSku = (sku: string): string => `No product has the SKU ${sku}`;

interface QueuedFile {
  readonly item: BulkItem;
  readonly file: File;
}

/** Turns a dropped file into its initial row: unparsable names and bad images fail before any request. */
export const classifyFile = (id: number, file: File): BulkItem => {
  const parsed = parseImageFilename(file.name);
  const invalid = validateImageFile(file);
  const error = parsed === null ? IMAGE_NAME_MESSAGE : invalid;
  return {
    id,
    name: file.name,
    sku: parsed?.sku ?? null,
    productName: null,
    state: error === null ? 'queued' : 'failed',
    progress: 0,
    error,
  };
};

/**
 * Many files named `SKU-n.ext` → look each SKU up once → P06 presign/confirm per file → poll the
 * media job. Files are processed one after another so a large drop cannot swamp the bucket.
 */
export function BulkImageUpload({ pollIntervalMs }: BulkImageUploadProps) {
  const [items, setItems] = useState<readonly BulkItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const sequence = useRef(0);
  const products = useRef(new Map<string, Promise<AdminProductRow | null>>());
  const pollOptions = pollIntervalMs === undefined ? {} : { intervalMs: pollIntervalMs };

  const patch = (id: number, changes: Partial<BulkItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const lookup = (sku: string): Promise<AdminProductRow | null> => {
    const cached = products.current.get(sku);
    if (cached !== undefined) return cached;
    const pending = resolveProductBySku(sku).catch(() => {
      products.current.delete(sku);
      return null;
    });
    products.current.set(sku, pending);
    return pending;
  };

  const run = async ({ item, file }: QueuedFile) => {
    if (item.sku === null) return;
    try {
      const product = await lookup(item.sku);
      if (product === null) throw new Error(unknownSku(item.sku));
      patch(item.id, { state: 'uploading', productName: product.name });
      const { jobId } = await presignAndUpload({
        ...productImagePaths(product.id),
        file,
        alt: '',
        onProgress: (fraction) => patch(item.id, { progress: fraction }),
      });
      patch(item.id, { state: 'processing', progress: 1 });
      await pollJob(jobId, pollOptions);
      patch(item.id, { state: 'done' });
    } catch (error) {
      patch(item.id, { state: 'failed', error: messageOf(error) });
    }
  };

  const accept = (files: readonly File[]) => {
    if (files.length === 0) return;
    const queued = files.map((file) => {
      sequence.current += 1;
      return { item: classifyFile(sequence.current, file), file };
    });
    setItems((prev) => [...prev, ...queued.map((entry) => entry.item)]);
    void (async () => {
      for (const entry of queued) if (entry.item.state === 'queued') await run(entry);
    })();
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
    <div data-testid="bulk-image-upload">
      <div
        className="admin-dropzone"
        data-active={dragActive ? 'true' : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        data-testid="bulk-dropzone"
      >
        <label htmlFor="bulk-images" className="admin-btn admin-btn-primary">
          Choose images
        </label>
        <input
          id="bulk-images"
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          onChange={onInput}
          className="admin-visually-hidden"
          data-testid="bulk-image-input"
        />
        <p className="admin-muted admin-form-status admin-import-hint">
          Name files <code className="admin-mono">SKU-1.jpg</code>,{' '}
          <code className="admin-mono">SKU-2.jpg</code> … — JPEG, PNG, WebP or AVIF up to 10 MB
          each.
        </p>
      </div>
      {items.length > 0 && (
        <ul className="admin-upload-rows admin-bulk-rows" aria-label="Image uploads">
          {items.map((item) => (
            <li key={item.id} className="admin-upload-row" data-testid="bulk-row">
              <span>
                {item.name}
                {item.productName !== null && (
                  <span className="admin-muted"> → {item.productName}</span>
                )}
              </span>
              <span
                className={item.state === 'failed' ? 'admin-error' : 'admin-muted'}
                data-testid="bulk-state"
              >
                {STATE_LABEL[item.state]}
              </span>
              {item.state === 'uploading' && (
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
                <p className="admin-error" role="alert" data-testid="bulk-error">
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
