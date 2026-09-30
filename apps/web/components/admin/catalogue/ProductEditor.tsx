'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminCategoryNode, AdminProductDetail } from '@/lib/admin/catalogue-types';

import { ConfirmDialog } from '../ConfirmDialog';
import type { AdminRole } from '../Nav.config';
import { PageHeader } from '../PageHeader';
import { useToast } from '../Toast';

import { ImageGrid } from './ImageGrid';
import { ImageUploader } from './ImageUploader';
import { ProductForm } from './ProductForm';
import { PublishToggle } from './PublishToggle';
import { VariantsTable } from './VariantsTable';

interface ProductEditorProps {
  readonly product: AdminProductDetail;
  readonly categories: readonly AdminCategoryNode[];
  readonly role: AdminRole;
}

const ORDERED_HINT = 'Ordered products cannot be deleted; unpublish instead.';

/** Product editor (P06 task 8): content form, variants, images and publish state on one page. */
export function ProductEditor({ product: initial, categories, role }: ProductEditorProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [product, setProduct] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const base = `/admin/products/${product.id}`;

  const reload = async () => {
    try {
      const { data } = await adminApi.get<AdminProductDetail>(base);
      setProduct(data);
    } catch {
      router.refresh();
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await adminApi.del(base);
      notify(`Deleted ${product.name}`, 'success');
      router.push('/admin/products');
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Could not delete the product.', 'critical');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <>
      <PageHeader
        title={product.name}
        description={`SKU ${product.sku} · /products/${product.slug}`}
        actions={
          <PublishToggle
            productId={product.id}
            isActive={product.isActive}
            role={role}
            onChanged={setProduct}
          />
        }
      />
      <div className="admin-editor-layout">
        <div>
          <ProductForm product={product} categories={categories} role={role} onSaved={setProduct} />
        </div>
        <aside className="admin-editor-aside">
          <section className="admin-section" aria-labelledby="variants-heading">
            <VariantsTable
              productId={product.id}
              variants={product.variants}
              role={role}
              onChanged={(variants) => setProduct({ ...product, variants })}
            />
          </section>
          <section className="admin-section" aria-labelledby="images-title">
            <h2 id="images-title" className="admin-section-title">
              Images ({product.images.length})
            </h2>
            <ImageUploader
              presignPath={`${base}/images/presign`}
              confirmPath={`${base}/images/confirm`}
              currentCount={product.images.length}
              onUploaded={reload}
            />
            <ImageGrid
              productId={product.id}
              images={product.images}
              onChanged={(images) => setProduct({ ...product, images })}
            />
          </section>
          {role === 'ADMIN' && (
            <section className="admin-section" aria-labelledby="danger-title">
              <h2 id="danger-title" className="admin-section-title">
                Danger zone
              </h2>
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={product.everOrdered}
                data-testid="product-delete"
              >
                Delete product
              </button>
              {product.everOrdered && <p className="admin-hint">{ORDERED_HINT}</p>}
            </section>
          )}
        </aside>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${product.name}?`}
        body="Its variants and images are removed. Products with stock history or orders are refused by the API."
        confirmLabel="Delete"
        destructive
        busy={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
        testId="product-delete-confirm"
      />
    </>
  );
}
