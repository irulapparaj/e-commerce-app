'use client';

import { useEffect, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { ExportRequested, ExportStatus, ExportType } from '@/lib/admin/import-types';

import { FormField } from '../FormField';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

interface ExportPanelProps {
  readonly role: AdminRole;
  readonly pollIntervalMs?: number;
}

export const REASON_MIN = 10;
export const CANCELLED_MESSAGE = 'Confirmation was cancelled; no export was requested.';
const DEFAULT_POLL_MS = 2000;

const TYPE_LABEL: Readonly<Record<ExportType, string>> = {
  products: 'Products',
  orders: 'Orders',
  customers: 'Customers',
};

const isPending = (status: ExportStatus): boolean =>
  status.state !== 'completed' && status.state !== 'failed' && status.state !== 'cancelled';

const stateLabel = (status: ExportStatus): string => {
  if (status.state === 'completed') return status.url === null ? 'Ready' : 'Ready to download';
  if (status.state === 'failed') return `Failed: ${status.error ?? 'unknown error'}`;
  if (status.state === 'cancelled') return 'Cancelled';
  return 'Generating…';
};

/**
 * Products for everyone; orders/customers for ADMIN behind step-up (P07 task 8). A "full" export
 * needs a justification of at least 10 characters, which the API audits with the request.
 */
export function ExportPanel({ role, pollIntervalMs = DEFAULT_POLL_MS }: ExportPanelProps) {
  const { notify } = useToast();
  const [full, setFull] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ExportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<readonly ExportStatus[]>([]);
  const reasonTooShort = full && reason.trim().length < REASON_MIN;
  const pendingIds = requests.filter(isPending).map((status) => status.id);
  /** Stable while the same exports are pending, so the interval survives unrelated re-renders. */
  const pendingKey = pendingIds.join(',');

  useEffect(() => {
    if (pendingKey === '') return undefined;
    const ids = pendingKey.split(',');
    let cancelled = false;
    const tick = async () => {
      const updates = await Promise.all(
        ids.map(async (id) => {
          try {
            const { data } = await adminApi.get<ExportStatus>(`/admin/export/${id}`);
            return data;
          } catch {
            // Transient failure: keep the previous row and try again on the next tick.
            return null;
          }
        }),
      );
      if (cancelled) return;
      setRequests((prev) =>
        prev.map((status) => updates.find((update) => update?.id === status.id) ?? status),
      );
    };
    const timer = window.setInterval(() => void tick(), pollIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pendingKey, pollIntervalMs]);

  const request = async (type: ExportType) => {
    setBusy(type);
    setError(null);
    try {
      const body = type === 'products' ? undefined : full ? { full, reason: reason.trim() } : {};
      const { data } = await adminApi.post<ExportRequested>(`/admin/export/${type}`, body);
      setRequests((prev) => [
        { id: data.exportId, type, state: 'created', url: null, expiresAt: null, error: null },
        ...prev,
      ]);
      notify(`${TYPE_LABEL[type]} export queued`, 'success');
    } catch (caught) {
      if (!isAdminApiError(caught)) setError('Could not request the export. Try again.');
      else setError(caught.code === 'STEP_UP_REQUIRED' ? CANCELLED_MESSAGE : caught.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="admin-export">
      <ul className="admin-export-cards" aria-label="Exports">
        <li className="admin-panel admin-export-card">
          <p className="admin-panel-title">Products</p>
          <p className="admin-muted">
            The whole catalogue in the import format, so an edited export can be re-imported.
          </p>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => void request('products')}
            disabled={busy !== null}
            data-testid="export-products"
          >
            {busy === 'products' ? 'Requesting…' : 'Export products'}
          </button>
        </li>
        {role === 'ADMIN' && (
          <li className="admin-panel admin-export-card admin-export-card-sensitive">
            <p className="admin-panel-title">Orders and customers</p>
            <p className="admin-muted">
              Personal data is minimised: masked phones, no names or address lines. Each request
              needs a fresh authenticator code and is audited.
            </p>
            <FormField
              id="export-full"
              label="Full export (names, addresses, plain phone numbers)"
              inline
            >
              {(control) => (
                <input
                  {...control}
                  type="checkbox"
                  checked={full}
                  onChange={(event) => setFull(event.target.checked)}
                  data-testid="export-full"
                />
              )}
            </FormField>
            {full && (
              <FormField
                id="export-reason"
                label="Why is the full data needed?"
                help={`At least ${REASON_MIN} characters; recorded in the audit log.`}
                error={reason.length > 0 && reasonTooShort ? 'Add a slightly longer reason.' : null}
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="admin-textarea"
                    rows={2}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    data-testid="export-reason"
                  />
                )}
              </FormField>
            )}
            <div className="admin-row-actions">
              <button
                type="button"
                className="admin-btn"
                onClick={() => void request('orders')}
                disabled={busy !== null || reasonTooShort}
                data-testid="export-orders"
              >
                {busy === 'orders' ? 'Requesting…' : 'Export orders'}
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => void request('customers')}
                disabled={busy !== null || reasonTooShort}
                data-testid="export-customers"
              >
                {busy === 'customers' ? 'Requesting…' : 'Export customers'}
              </button>
            </div>
          </li>
        )}
      </ul>
      {error !== null && (
        <p role="alert" className="admin-error" data-testid="export-error">
          {error}
        </p>
      )}
      {requests.length > 0 && (
        <section className="admin-section" aria-labelledby="export-requests-heading">
          <h2 id="export-requests-heading" className="admin-section-title">
            Requested exports
          </h2>
          <ul className="admin-status-list" aria-label="Export requests">
            {requests.map((status) => (
              <li key={status.id} className="admin-status-row" data-testid="export-row">
                <span>{TYPE_LABEL[status.type]}</span>
                <span
                  className={status.state === 'failed' ? 'admin-error' : 'admin-muted'}
                  role="status"
                  data-testid="export-status"
                >
                  {stateLabel(status)}
                </span>
                {status.url !== null && (
                  <a
                    href={status.url}
                    className="admin-btn admin-btn-small admin-btn-primary"
                    download
                    data-testid="export-download"
                  >
                    Download (link valid 15 min)
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
