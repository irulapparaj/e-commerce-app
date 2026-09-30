'use client';

import { useEffect, useRef, useState } from 'react';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { formatCountdown } from '@/lib/admin/format';

import { useStepUpRemaining } from './StepUpProvider';

export interface AdminUser {
  readonly email: string;
  readonly role: string;
  readonly mfaEnabled: boolean;
  readonly name?: string | null;
}

interface UserMenuProps {
  readonly user: AdminUser;
}

function StepUpStatus() {
  const remaining = useStepUpRemaining();
  if (remaining <= 0) return <span className="admin-muted">Not active</span>;
  return (
    <span className="admin-tabular" data-testid="stepup-countdown">
      {formatCountdown(remaining)} left
    </span>
  );
}

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="admin-user-menu" ref={rootRef}>
      <button
        type="button"
        className="admin-user-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="admin-user-panel"
        onClick={() => setOpen((current) => !current)}
        data-testid="user-menu"
      >
        <span className="admin-user-email">{user.email}</span>
        <span className="admin-badge">{user.role}</span>
      </button>
      {open && (
        <div id="admin-user-panel" className="admin-user-panel" data-testid="user-panel">
          <dl className="admin-user-details">
            <div>
              <dt>Signed in as</dt>
              <dd>{user.name === null || user.name === undefined ? user.email : user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
            <div>
              <dt>MFA</dt>
              <dd>{user.mfaEnabled ? 'Enrolled' : 'Not enrolled'}</dd>
            </div>
            <div>
              <dt>Step-up</dt>
              <dd>
                <StepUpStatus />
              </dd>
            </div>
          </dl>
          <div className="admin-user-actions">
            <SignOutButton redirectTo="/admin/login" />
            <SignOutButton redirectTo="/admin/login" everywhere />
          </div>
        </div>
      )}
    </div>
  );
}
