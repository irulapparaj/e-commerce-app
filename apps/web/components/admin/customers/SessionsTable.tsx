'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { CustomerSession } from '@/lib/admin/customer-types';
import { formatDateTime, truncate } from '@/lib/admin/format';

import { ConfirmDialog } from '../ConfirmDialog';
import { type Column, DataTable } from '../DataTable';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

interface SessionsTableProps {
  readonly customerId: string;
  readonly rows: readonly CustomerSession[];
  readonly role: AdminRole;
}

const UA_MAX = 48;

/** The customer's refresh sessions; revoke is ADMIN ⚡ (`POST …/sessions/:sessionId/revoke`). */
export function SessionsTable({ customerId, rows: initial, role }: SessionsTableProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState<CustomerSession | null>(null);
  const [busy, setBusy] = useState(false);
  // Local copy so a revoke disappears immediately; server props replace it after refresh.
  const [rows, setRows] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setRows(initial);
  }

  const revoke = async (session: CustomerSession) => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/customers/${customerId}/sessions/${session.id}/revoke`);
      setRows((current) => current.filter((row) => row.id !== session.id));
      notify('Session revoked', 'success');
      router.refresh();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Something went wrong', 'critical');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const columns: readonly Column<CustomerSession>[] = [
    {
      key: 'audience',
      header: 'Surface',
      render: (row) => <span className="admin-badge">{row.audience}</span>,
    },
    { key: 'ip', header: 'IP' },
    {
      key: 'userAgent',
      header: 'Device',
      render: (row) =>
        row.userAgent === null ? (
          '—'
        ) : (
          <span title={row.userAgent}>{truncate(row.userAgent, UA_MAX)}</span>
        ),
    },
    { key: 'lastUsedAt', header: 'Last used', render: (row) => formatDateTime(row.lastUsedAt) },
    { key: 'expiresAt', header: 'Expires', render: (row) => formatDateTime(row.expiresAt) },
    ...(role === 'ADMIN'
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (row: CustomerSession) => (
              <button
                type="button"
                className="admin-btn admin-btn-small admin-btn-danger"
                onClick={() => setPending(row)}
                disabled={busy}
                aria-label={`Revoke ${row.audience.toLowerCase()} session from ${row.ip ?? 'unknown IP'}`}
                data-testid="session-revoke"
              >
                Revoke
              </button>
            ),
          } satisfies Column<CustomerSession>,
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Customer sessions"
        emptyTitle="No active sessions"
        emptyDescription="The customer is signed out everywhere."
        rowTestId="session-row"
      />
      {pending !== null && (
        <ConfirmDialog
          open
          title="Revoke this session?"
          body="The device is signed out immediately; its access token may remain valid for up to 15 minutes."
          confirmLabel="Revoke"
          destructive
          busy={busy}
          onConfirm={() => void revoke(pending)}
          onCancel={() => setPending(null)}
          testId="session-confirm"
        />
      )}
    </>
  );
}
