import { brand } from '@pe/shared';

import { SignOutButton } from '@/components/auth/SignOutButton';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const session = await getSession();

  return (
    <main className="page" aria-labelledby="admin-heading">
      <h1 id="admin-heading">{brand.name} admin</h1>
      <p className="muted" style={{ marginTop: 'var(--space-2)' }} data-testid="admin-session">
        Signed in as {session?.role ?? '—'}. The admin console arrives with plan P05.
      </p>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <SignOutButton redirectTo="/admin/login" />
      </div>
    </main>
  );
}
