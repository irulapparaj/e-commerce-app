'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminProductDetail } from '@/lib/admin/catalogue-types';

import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import { ADMIN_ONLY_HINT } from './product-form';

interface PublishToggleProps {
  readonly productId: string;
  readonly isActive: boolean;
  readonly role: AdminRole;
  readonly onChanged: (product: AdminProductDetail) => void;
}

export const INCOMPLETE_MESSAGE = 'Add at least one variant and one processed image first';
const CANCELLED = 'Confirmation was cancelled; the product was not changed.';

/** `PATCH /admin/products/:id/publish` (ADMIN ⚡); 422 PRODUCT_INCOMPLETE is explained inline. */
export function PublishToggle({ productId, isActive, role, onChanged }: PublishToggleProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await adminApi.patch<AdminProductDetail>(
        `/admin/products/${productId}/publish`,
        { isActive: !isActive },
      );
      onChanged(data);
      notify(data.isActive ? 'Product published' : 'Product unpublished', 'success');
    } catch (failure) {
      if (isAdminApiError(failure) && failure.code === 'PRODUCT_INCOMPLETE')
        setError(INCOMPLETE_MESSAGE);
      else if (isAdminApiError(failure) && failure.code === 'STEP_UP_REQUIRED')
        notify(CANCELLED, 'critical');
      else notify(isAdminApiError(failure) ? failure.message : 'Something went wrong', 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-panel" data-testid="publish-panel">
      <p className="admin-panel-title">Visibility</p>
      <p style={{ margin: '0 0 0.5rem' }}>
        <span
          className={
            isActive ? 'admin-badge admin-badge-success' : 'admin-badge admin-badge-warning'
          }
          data-testid="publish-badge"
        >
          {isActive ? 'Published' : 'Draft'}
        </span>
      </p>
      {role === 'ADMIN' ? (
        <button
          type="button"
          className={isActive ? 'admin-btn' : 'admin-btn admin-btn-primary'}
          onClick={() => void toggle()}
          disabled={busy}
          data-testid="publish-toggle"
        >
          {busy ? 'Working…' : isActive ? 'Unpublish' : 'Publish'}
        </button>
      ) : (
        <p className="admin-muted admin-form-status" style={{ margin: 0 }}>
          Publishing: {ADMIN_ONLY_HINT}
        </p>
      )}
      {error !== null && (
        <p className="admin-error" role="alert" data-testid="publish-error">
          {error}
        </p>
      )}
    </div>
  );
}
