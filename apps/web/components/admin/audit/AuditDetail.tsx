'use client';

import { diffRows } from '@/lib/admin/audit-diff';
import { formatDateTime } from '@/lib/admin/format';
import type { AuditRow } from '@/lib/admin/types';

import { Dialog } from '../Dialog';

interface AuditDetailProps {
  readonly row: AuditRow | null;
  readonly onClose: () => void;
}

/** Side-by-side before/after for one audit row; changed keys are highlighted. */
export function AuditDetail({ row, onClose }: AuditDetailProps) {
  if (row === null) return null;
  const rows = diffRows(row.before, row.after);
  return (
    <Dialog open titleId="audit-detail-title" onClose={onClose} size="lg" testId="audit-detail">
      <div className="admin-dialog-body">
        <h2 id="audit-detail-title" className="admin-dialog-title">
          {row.action}
        </h2>
        <dl className="admin-meta-list">
          <dt>When</dt>
          <dd>{formatDateTime(row.createdAt)}</dd>
          <dt>Actor</dt>
          <dd>{row.actor === null ? 'system' : `${row.actor.email} (${row.actor.role})`}</dd>
          <dt>Entity</dt>
          <dd>
            {row.entityType}
            {row.entityId === null ? '' : ` · ${row.entityId}`}
          </dd>
          <dt>IP</dt>
          <dd>{row.ip ?? '—'}</dd>
          <dt>User agent</dt>
          <dd>{row.userAgent ?? '—'}</dd>
        </dl>
        {rows.length === 0 ? (
          <p className="admin-muted">No before/after payload was recorded.</p>
        ) : (
          <table className="admin-diff" data-testid="audit-diff">
            <caption className="admin-visually-hidden">Before and after values</caption>
            <thead>
              <tr>
                <th scope="col" className="admin-diff-key">
                  Key
                </th>
                <th scope="col">Before</th>
                <th scope="col">After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr
                  key={entry.key}
                  className={entry.changed ? 'admin-diff-changed' : undefined}
                  data-changed={entry.changed ? 'true' : 'false'}
                >
                  <th scope="row" className="admin-diff-key">
                    {entry.key}
                  </th>
                  <td>
                    <pre>{entry.before}</pre>
                  </td>
                  <td>
                    <pre>{entry.after}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose} data-autofocus>
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
