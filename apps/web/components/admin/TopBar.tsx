import { type AdminUser, UserMenu } from './UserMenu';

interface TopBarProps {
  /** `NODE_ENV` from the server layout; never read on the client. */
  readonly environment: string;
  readonly user: AdminUser;
}

export function TopBar({ environment, user }: TopBarProps) {
  return (
    <header className="admin-topbar">
      <span className={`admin-env admin-env-${environment}`} data-testid="env-badge">
        {environment}
      </span>
      <UserMenu user={user} />
    </header>
  );
}
