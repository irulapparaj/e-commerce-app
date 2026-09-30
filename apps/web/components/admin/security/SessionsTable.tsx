'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { formatDateTime, truncate } from '@/lib/admin/format';
import type { AdminSessionRow } from '@/lib/admin/types';

import { ConfirmDialog } from '../ConfirmDialog';
import { type Column, DataTable } from '../DataTable';
import { useToast } from '../Toast';

interface SessionsTableProps {
  readonly rows: readonly AdminSessionRow[];
}

const UA_MAX = 48;

/** Active admin sessions with a step-up-guarded revoke (`POST /admin/security/sessions/:id/revoke`). */
export function SessionsTable({ rows }: SessionsTableProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState<AdminSessionRow | null>(null);
  const [busy, setBusy] = useState(false);

  const revoke = async (session: AdminSessionRow) => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/security/sessions/${session.id}/revoke`);
      notify(`Session for ${session.user.email} revoked`, 'success');
      router.refresh();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Something went wrong', 'critical');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const columns: readonly Column<AdminSessionRow>[] = [
    { key: 'user', header: 'User', render: (row) => `${row.user.email} (${row.user.role})` },
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
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <button
          type="button"
          className="admin-btn admin-btn-small admin-btn-danger"
          onClick={() => setPending(row)}
          aria-label={`Revoke session for ${row.user.email}`}
        >
          Revoke
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Active admin sessions"
        emptyTitle="No active admin sessions"
        rowTestId="session-row"
      />
      {pending !== null && (
        <ConfirmDialog
          open
          title={`Revoke this session for ${pending.user.email}?`}
          body="The device is signed out immediately; an access token may remain valid for up to 15 minutes."
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
