import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CustomerDetail } from '@/components/admin/customers/CustomerDetail';
import type { CustomerDetailDto, CustomerSession } from '@/lib/admin/customer-types';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer' };

const NOT_FOUND = 404;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CustomerPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function CustomerPage({ params }: CustomerPageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, customer, sessions] = await Promise.all([
    getSession(),
    adminServerGet<CustomerDetailDto>(`/admin/customers/${id}`),
    adminServerGet<readonly CustomerSession[]>(`/admin/customers/${id}/sessions`),
  ]);
  if (!customer.ok && customer.status === NOT_FOUND) notFound();
  if (!customer.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load the customer ({customer.code}).
      </p>
    );
  return (
    <CustomerDetail
      customer={customer.data}
      sessions={sessions.ok ? sessions.data : []}
      role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
    />
  );
}
