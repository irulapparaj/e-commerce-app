'use client';

import type { StaffRole, StaffRow } from '@/lib/admin/types';

export type StaffAction =
  | { readonly kind: 'role'; readonly row: StaffRow; readonly role: StaffRole }
  | { readonly kind: 'mfa-reset'; readonly row: StaffRow }
  | { readonly kind: 'revoke-sessions'; readonly row: StaffRow };

interface StaffRowActionsProps {
  readonly row: StaffRow;
  readonly onAction: (action: StaffAction) => void;
}

const isStaffRole = (value: string): value is StaffRole => value === 'ADMIN' || value === 'STAFF';

export function StaffRowActions({ row, onAction }: StaffRowActionsProps) {
  return (
    <div className="admin-row-actions">
      <select
        className="admin-select"
        aria-label={`Role for ${row.email}`}
        value={row.role}
        onChange={(event) => {
          const role = event.target.value;
          if (isStaffRole(role) && role !== row.role) onAction({ kind: 'role', row, role });
        }}
        data-testid="staff-role-select"
      >
        <option value="STAFF">STAFF</option>
        <option value="ADMIN">ADMIN</option>
      </select>
      <button
        type="button"
        className="admin-btn admin-btn-small"
        onClick={() => onAction({ kind: 'mfa-reset', row })}
        aria-label={`Reset MFA for ${row.email}`}
      >
        Reset MFA
      </button>
      <button
        type="button"
        className="admin-btn admin-btn-small admin-btn-danger"
        onClick={() => onAction({ kind: 'revoke-sessions', row })}
        aria-label={`Revoke sessions for ${row.email}`}
        disabled={row.sessionCount === 0}
      >
        Revoke sessions
      </button>
    </div>
  );
}
