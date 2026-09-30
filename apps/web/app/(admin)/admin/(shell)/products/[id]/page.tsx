import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductEditor } from '@/components/admin/catalogue/ProductEditor';
import type { AdminCategoryNode, AdminProductDetail } from '@/lib/admin/catalogue-types';
import { adminServerGet } from '@/lib/admin/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit product' };

const NOT_FOUND = 404;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProductPageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [session, product, categories] = await Promise.all([
    getSession(),
    adminServerGet<AdminProductDetail>(`/admin/products/${id}`),
    adminServerGet<readonly AdminCategoryNode[]>('/admin/categories'),
  ]);
  if (!product.ok && product.status === NOT_FOUND) notFound();
  if (!product.ok || !categories.ok)
    return (
      <p role="alert" className="admin-error">
        Could not load the product (
        {product.ok ? (categories.ok ? '' : categories.code) : product.code}).
      </p>
    );
  return (
    <ProductEditor
      product={product.data}
      categories={categories.data}
      role={session?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
    />
  );
}
