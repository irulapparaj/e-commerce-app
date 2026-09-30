import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/AdminShell';
import type { AdminUser } from '@/components/admin/UserMenu';
import { adminServerGet } from '@/lib/admin/server';
import type { MeResponse } from '@/lib/admin/types';
import { getSession } from '@/lib/auth/session';
import { getWebEnv } from '@/lib/env';
import { NONCE_HEADER } from '@/lib/security-headers';

import '@/styles/admin/shell.css';
import '@/styles/admin/page.css';
import '@/styles/admin/controls.css';
import '@/styles/admin/table.css';
import '@/styles/admin/overlays.css';
import '@/styles/admin/catalogue.css';
import '@/styles/admin/import.css';
import '@/styles/admin/customers.css';

export const dynamic = 'force-dynamic';

const ADMIN_LOGIN = '/admin/login';
const UNAUTHENTICATED = 401;

/** Belt and braces with middleware: no admin session, no shell. `/admin/login` lives outside this group. */
export default async function AdminShellLayout({ children }: { readonly children: ReactNode }) {
  const session = await getSession();
  if (session === null || session.aud !== 'admin') redirect(ADMIN_LOGIN);

  const me = await adminServerGet<MeResponse>('/auth/me');
  if (!me.ok && me.status === UNAUTHENTICATED) redirect(ADMIN_LOGIN);
  // An admin session only exists after MFA verification, so the fallback reflects that.
  const user: AdminUser = me.ok
    ? {
        email: me.data.user.email,
        role: me.data.user.role,
        mfaEnabled: me.data.user.mfaEnabled,
        name: me.data.user.name,
      }
    : { email: 'unavailable', role: session.role, mfaEnabled: true, name: null };

  const nonce = (await headers()).get(NONCE_HEADER) ?? '';

  return (
    <AdminShell
      nonce={nonce}
      environment={getWebEnv().NODE_ENV}
      user={user}
      stepUpExp={session.stepUpExp}
    >
      {children}
    </AdminShell>
  );
}
