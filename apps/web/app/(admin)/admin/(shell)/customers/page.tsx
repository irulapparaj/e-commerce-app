import type { Metadata } from 'next';

import { CustomerTable } from '@/components/admin/customers/CustomerTable';
import { PageHeader } from '@/components/admin/PageHeader';
import type { CustomerRow } from '@/lib/admin/customer-types';
import { CUSTOMER_FILTER_KEYS } from '@/lib/admin/filter-keys';
import { buildQuery, parsePage, pickParams } from '@/lib/admin/query';
import { adminServerGet } from '@/lib/admin/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers' };

const PAGE_LIMIT = 20;

interface CustomersPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const filters = pickParams(params, CUSTOMER_FILTER_KEYS);
  const page = parsePage(pickParams(params, ['page']).page);
  const customers = await adminServerGet<readonly CustomerRow[]>(
    `/admin/customers${buildQuery({ ...filters, page, limit: PAGE_LIMIT })}`,
  );
  if (!customers.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load customers ({customers.code}).
      </p>
    );
  return (
    <>
      <PageHeader
        title="Customers"
        description="Contact details are masked by default; an admin can reveal them with a reason for a few minutes."
      />
      <CustomerTable
        rows={customers.data}
        pagination={customers.meta ?? { page, limit: PAGE_LIMIT, total: customers.data.length }}
        filters={filters}
      />
    </>
  );
}
