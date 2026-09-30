'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import { formatDateTime } from '@/lib/admin/format';
import type { StaffRow } from '@/lib/admin/types';

import { ConfirmDialog } from '../ConfirmDialog';
import { type Column, DataTable } from '../DataTable';
import { PageHeader } from '../PageHeader';
import { useToast } from '../Toast';

import { InviteDialog } from './InviteDialog';
import { type StaffAction, StaffRowActions } from './StaffRowActions';

interface StaffPanelProps {
  readonly rows: readonly StaffRow[];
}

interface ActionCopy {
  readonly title: string;
  readonly body: string;
  readonly confirm: string;
  readonly destructive: boolean;
  readonly path: string;
  readonly payload?: unknown;
  readonly done: string;
}

const describe = (action: StaffAction): ActionCopy => {
  const base = `/admin/staff/${action.row.id}`;
  switch (action.kind) {
    case 'role':
      return {
        title: `Change ${action.row.email} to ${action.role}?`,
        body: 'Their sessions are revoked immediately; they sign in again with the new role.',
        confirm: 'Change role',
        destructive: action.role === 'STAFF',
        path: `${base}/role`,
        payload: { role: action.role },
        done: `Role changed to ${action.role}`,
      };
    case 'mfa-reset':
      return {
        title: `Reset MFA for ${action.row.email}?`,
        body: 'Their authenticator and recovery codes are cleared, sessions revoked, and they must enrol again at next login.',
        confirm: 'Reset MFA',
        destructive: true,
        path: `${base}/mfa-reset`,
        done: 'MFA reset; re-enrolment email sent',
      };
    case 'revoke-sessions':
      return {
        title: `Revoke all sessions for ${action.row.email}?`,
        body: 'Every device is signed out. Their access token may stay valid for up to 15 minutes.',
        confirm: 'Revoke sessions',
        destructive: true,
        path: `${base}/revoke-sessions`,
        done: 'Sessions revoked',
      };
  }
};

/** Staff & Roles: every mutation is ADMIN ⚡ and confirmed first; the API enforces both. */
export function StaffPanel({ rows }: StaffPanelProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<StaffAction | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: StaffAction) => {
    const copy = describe(action);
    setBusy(true);
    try {
      await adminApi.post(copy.path, copy.payload);
      notify(copy.done, 'success');
      setPending(null);
      router.refresh();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Something went wrong', 'critical');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  const columns: readonly Column<StaffRow>[] = [
    { key: 'email', header: 'Email' },
    { key: 'name', header: 'Name' },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <span className="admin-badge">{row.role}</span>,
    },
    {
      key: 'mfaEnabled',
      header: 'MFA',
      render: (row) => (row.mfaEnabled ? 'Enrolled' : 'Pending'),
    },
    { key: 'lastLoginAt', header: 'Last login', render: (row) => formatDateTime(row.lastLoginAt) },
    { key: 'sessionCount', header: 'Sessions', align: 'end' },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => <StaffRowActions row={row} onAction={setPending} />,
    },
  ];

  const copy = pending === null ? null : describe(pending);

  return (
    <>
      <PageHeader
        title="Staff & Roles"
        description="Invite people, assign roles, reset authenticators and sign devices out."
        actions={
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => setInviteOpen(true)}
            data-testid="invite-open"
          >
            Invite
          </button>
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Staff accounts"
        emptyTitle="No staff yet"
        emptyDescription="Invite your first team member."
        rowTestId="staff-row"
      />
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={(user) => {
          setInviteOpen(false);
          notify(`Invite sent to ${user.email}`, 'success');
          router.refresh();
        }}
      />
      {copy !== null && pending !== null && (
        <ConfirmDialog
          open
          title={copy.title}
          body={copy.body}
          confirmLabel={copy.confirm}
          destructive={copy.destructive}
          busy={busy}
          onConfirm={() => void run(pending)}
          onCancel={() => setPending(null)}
          testId="staff-confirm"
        />
      )}
    </>
  );
}
