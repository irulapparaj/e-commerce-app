import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';

import { OrderCard } from '@/components/account/OrderCard';
import { apiGet } from '@/lib/api/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Orders' };

interface OrdersPageProps {
  readonly params: Promise<{ locale: string }>;
  readonly searchParams: Promise<{ page?: string }>;
}

export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { page = '1' } = await searchParams;

  let orders: Array<{ id: string; orderNumber: string; status: string; totalPaise: number; itemCount: number; createdAt: string }> = [];
  let total = 0;

  try {
    const result = await apiGet<typeof orders>(
      `/orders?page=${page}&limit=20`,
      { auth: true },
    );
    orders = result.data;
    total = result.meta?.total ?? 0;
  } catch {
    // handled below
  }

  return (
    <section aria-labelledby="orders-heading">
      <h2 id="orders-heading" style={{ fontSize: 'var(--text-h3)', marginBottom: 'var(--space-3)' }}>
        Your orders {total > 0 && <span style={{ color: 'var(--muted)', fontWeight: '400' }}>({total})</span>}
      </h2>
      {orders.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>You have not placed any orders yet.</p>
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
  );
}
