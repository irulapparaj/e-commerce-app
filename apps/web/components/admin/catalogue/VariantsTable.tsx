'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminVariant } from '@/lib/admin/catalogue-types';

import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../EmptyState';
import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import { ADMIN_ONLY_HINT } from './product-form';
import { buildVariantPatch, replaceVariant, type VariantDraft } from './variant-form';
import { VariantDialog } from './VariantDialog';
import { VariantRow } from './VariantRow';

interface VariantsTableProps {
  readonly productId: string;
  readonly variants: readonly AdminVariant[];
  readonly role: AdminRole;
  readonly onChanged: (variants: readonly AdminVariant[]) => void;
}

const HEADERS = [
  'SKU',
  'Label',
  'Weight (g)',
  'Stock',
  'Threshold',
  'Price (₹)',
  'Compare-at (₹)',
  'Default',
  'Actions',
] as const;

const CANCELLED = 'Confirmation was cancelled; the price was not changed.';

const describe = (error: unknown, fallback: string): string =>
  isAdminApiError(error)
    ? error.code === 'STEP_UP_REQUIRED'
      ? CANCELLED
      : error.message
    : fallback;

/** Content and price save as separate requests so the ⚡ guard stays route-level. */
export function VariantsTable({ productId, variants, role, onChanged }: VariantsTableProps) {
  const { notify } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<AdminVariant | null>(null);
  const base = `/admin/products/${productId}/variants`;

  const save = async (variant: AdminVariant, draft: VariantDraft): Promise<boolean> => {
    const patch = buildVariantPatch(variant, draft, role);
    if (!patch.ok) {
      notify(patch.message, 'critical');
      return false;
    }
    setBusyId(variant.id);
    let latest = variant;
    try {
      if (patch.content !== null)
        latest = (await adminApi.patch<AdminVariant>(`${base}/${variant.id}`, patch.content)).data;
      if (patch.price !== null)
        latest = (await adminApi.patch<AdminVariant>(`${base}/${variant.id}/price`, patch.price))
          .data;
      onChanged(replaceVariant(variants, latest));
      notify(`Saved ${latest.sku}`, 'success');
      return true;
    } catch (error) {
      if (latest !== variant) onChanged(replaceVariant(variants, latest));
      notify(describe(error, 'Could not save the variant'), 'critical');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (variant: AdminVariant) => {
    setBusyId(variant.id);
    try {
      await adminApi.del(`${base}/${variant.id}`);
      onChanged(variants.filter((entry) => entry.id !== variant.id));
      notify(`Deleted ${variant.sku}`, 'success');
    } catch (error) {
      notify(describe(error, 'Could not delete the variant'), 'critical');
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  };

  return (
    <section className="admin-section" aria-labelledby="variants-heading">
      <div className="admin-page-header" style={{ marginBottom: '0.5rem' }}>
        <h2 id="variants-heading" className="admin-section-title">
          Variants
        </h2>
        {role === 'ADMIN' ? (
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => setAdding(true)}
            data-testid="variant-add"
          >
            Add variant
          </button>
        ) : (
          <span className="admin-muted admin-form-status">Adding variants: {ADMIN_ONLY_HINT}</span>
        )}
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="admin-visually-hidden">Product variants</caption>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header} scope="col">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {variants.map((variant) => (
              <VariantRow
                key={variant.id}
                variant={variant}
                role={role}
                busy={busyId === variant.id}
                onSave={(draft) => save(variant, draft)}
                onDelete={() => setDeleting(variant)}
              />
            ))}
          </tbody>
        </table>
        {variants.length === 0 && (
          <EmptyState
            title="No variants yet"
            description="A product needs at least one priced variant before it can be published."
          />
        )}
      </div>
      <VariantDialog
        open={adding}
        productId={productId}
        onClose={() => setAdding(false)}
        onCreated={(created) => {
          setAdding(false);
          onChanged(replaceVariant([...variants, created], created));
          notify(`Added ${created.sku}`, 'success');
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete variant ${deleting?.sku ?? ''}?`}
        body="Variants referenced by an order cannot be deleted; unpublish the product instead."
        confirmLabel="Delete"
        destructive
        busy={busyId !== null}
        onConfirm={() => (deleting === null ? undefined : void remove(deleting))}
        onCancel={() => setDeleting(null)}
        testId="variant-delete-confirm"
      />
    </section>
  );
}
