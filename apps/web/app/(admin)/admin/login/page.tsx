import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AdminLoginForm } from '@/components/auth/AdminLoginForm';

export const metadata: Metadata = { title: 'Admin sign in' };

export default function AdminLoginPage() {
  return (
    <main className="page" aria-labelledby="admin-login-heading" style={{ maxWidth: '28rem' }}>
      <h1 id="admin-login-heading">Admin sign in</h1>
      <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
        Email code first, then your authenticator app.
      </p>
      <div style={{ marginTop: 'var(--space-4)' }}>
        {/* Suspense boundary required because AdminLoginForm reads useSearchParams() */}
        <Suspense>
          <AdminLoginForm />
        </Suspense>
      </div>
    </main>
  );
}
