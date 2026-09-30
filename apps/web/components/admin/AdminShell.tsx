import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { StepUpProvider } from './StepUpProvider';
import { ToastProvider } from './Toast';
import { TopBar } from './TopBar';
import type { AdminUser } from './UserMenu';

interface AdminShellProps {
  /** Per-request CSP nonce from middleware; any inline `<script>` added later must carry it. */
  readonly nonce: string;
  readonly environment: string;
  readonly user: AdminUser;
  readonly stepUpExp: number | null;
  readonly children: ReactNode;
}

export function AdminShell({ nonce, environment, user, stepUpExp, children }: AdminShellProps) {
  return (
    <ToastProvider>
      <StepUpProvider initialStepUpExp={stepUpExp}>
        <div className="admin-shell" data-has-nonce={nonce === '' ? 'false' : 'true'}>
          <Sidebar role={user.role} />
          <div className="admin-main">
            <TopBar environment={environment} user={user} />
            <main className="admin-content" aria-labelledby="page-title">
              {children}
            </main>
          </div>
        </div>
      </StepUpProvider>
    </ToastProvider>
  );
}
