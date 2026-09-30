'use client';

import { useRouter } from 'next/navigation';

import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';

import type { AdminRole } from '../Nav.config';
import { PageHeader } from '../PageHeader';

import { ProductForm } from './ProductForm';

interface ProductCreateProps {
  readonly categories: readonly AdminCategoryNode[];
  readonly role: AdminRole;
}

/** New products start as drafts; variants and images are added in the editor afterwards. */
export function ProductCreate({ categories, role }: ProductCreateProps) {
  const router = useRouter();
  return (
    <>
      <PageHeader
        title="New product"
        description="Saved as a draft. Add variants and images next, then publish."
      />
      <ProductForm
        product={null}
        categories={categories}
        role={role}
        onSaved={(product) => router.push(`/admin/products/${product.id}`)}
      />
    </>
  );
}
