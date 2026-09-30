import type { Metadata } from 'next';

import { ProductCreate } from '@/components/admin/catalogue/ProductCreate';
import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  const [session, categories] = await Promise.all([
    getSession(),
    adminServerGet<readonly AdminCategoryNode[]>('/admin/categories'),
  ]);
  if (!categories.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load categories ({categories.code}).
      </p>
    );
  return (
    <ProductCreate
      categories={categories.data}
      role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
    />
  );
}
