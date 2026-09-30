import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { OrderCard } from '@/components/account/OrderCard';
import { ProfileForm } from '@/components/account/ProfileForm';
import { apiGet } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Account' };

interface AccountPageProps {
  readonly params: Promise<{ locale: string }>;
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [profileResult, ordersResult] = await Promise.allSettled([
    apiGet<{ user: { id: string; name: string | null; phone: string | null; email: string; role: string } }>('/auth/me', { auth: true }),
    apiGet<Array<{ id: string; orderNumber: string; status: string; totalPaise: number; itemCount: number; createdAt: string }>>('/orders?limit=3', { auth: true }),
  ]);

  const profile = profileResult.status === 'fulfilled' ? profileResult.value.data.user : null;
  const orders = ordersResult.status === 'fulfilled' ? ordersResult.value.data : [];

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {profile !== null && (
        <span data-testid="session-user" style={{ display: 'none' }}>{profile.role}</span>
      )}
      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>
          Profile
        </h2>
        {profile !== null ? (
          <>
            <p style={{ fontSize: 'var(--text-small)', color: 'var(--muted)', marginBottom: 'var(--space-3)' }}>
              {profile.email}
            </p>
            <ProfileForm name={profile.name} phone={profile.phone} />
          </>
        ) : (
          <p style={{ color: 'var(--muted)' }}>Unable to load profile.</p>
        )}
      </section>

      <section aria-labelledby="recent-orders-heading" data-testid="order-history">
        <h2 id="recent-orders-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>
          Recent orders
        </h2>
        {orders.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>No orders yet.</p>
        ) : (
          <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {orders.map((order) => (
              <li key={order.id}>
                <OrderCard {...order} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
