import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OrderDetail } from '@/components/admin/orders/OrderDetail';
import type { OrderDetailDto } from '@/lib/admin/order-types';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order' };

const NOT_FOUND = 404;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrderPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function OrderPage({ params }: OrderPageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, order] = await Promise.all([
    getSession(),
    adminServerGet<OrderDetailDto>(`/admin/orders/${id}`),
  ]);
  if (!order.ok && order.status === NOT_FOUND) notFound();
  if (!order.ok) {
    return (
      <p role="alert" className="admin-error">
        Could not load order ({order.code}).
      </p>
    );
  }
  return (
    <OrderDetail
      order={order.data}
      role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
    />
  );
}
