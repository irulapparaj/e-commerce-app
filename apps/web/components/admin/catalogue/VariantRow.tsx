'use client';

import { useState } from 'react';

import type { AdminVariant } from '@/lib/admin/catalogue-types';
import { formatCount } from '@/lib/admin/format';

import type { AdminRole } from '../Nav.config';

import { ADMIN_ONLY_HINT } from './product-form';
import { toDraft, type VariantDraft } from './variant-form';

interface VariantRowProps {
  readonly variant: AdminVariant;
  readonly role: AdminRole;
  readonly busy: boolean;
  readonly onSave: (draft: VariantDraft) => Promise<boolean>;
  readonly onDelete: () => void;
}

const same = (a: VariantDraft, b: VariantDraft): boolean => JSON.stringify(a) === JSON.stringify(b);

/** One editable variant. Content is STAFF-editable; price fields are ADMIN only (locked with a hint). */
export function VariantRow({ variant, role, busy, onSave, onDelete }: VariantRowProps) {
  const [draft, setDraft] = useState<VariantDraft>(() => toDraft(variant));
  const [synced, setSynced] = useState(variant);
  if (synced !== variant) {
    setSynced(variant);
    setDraft(toDraft(variant));
  }
  const dirty = !same(draft, toDraft(variant));
  const locked = role !== 'ADMIN';
  const set = (patch: Partial<VariantDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const label = (field: string) => `${field} for ${variant.sku}`;
  const priceTitle = locked ? ADMIN_ONLY_HINT : undefined;

  return (
    <tr data-testid="variant-row">
      <td>
        <input
          type="text"
          className="admin-input admin-input-small admin-mono"
          aria-label={label('SKU')}
          value={draft.sku}
          onChange={(event) => set({ sku: event.target.value })}
        />
      </td>
      <td>
        <input
          type="text"
          className="admin-input admin-input-small"
          aria-label={label('Label')}
          value={draft.label}
          onChange={(event) => set({ label: event.target.value })}
        />
      </td>
      <td>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          className="admin-input admin-input-small admin-tabular"
          aria-label={label('Weight in grams')}
          value={draft.weightGrams}
          onChange={(event) => set({ weightGrams: event.target.value })}
        />
      </td>
      <td className="admin-align-end admin-tabular" data-testid="variant-stock">
        {formatCount(variant.stock)}
      </td>
      <td>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          className="admin-input admin-input-small admin-tabular"
          aria-label={label('Low-stock threshold')}
          value={draft.lowStockThreshold}
          onChange={(event) => set({ lowStockThreshold: event.target.value })}
        />
      </td>
      <td>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          className="admin-input admin-input-small admin-tabular"
          aria-label={label('Price in rupees')}
          title={priceTitle}
          disabled={locked}
          value={draft.price}
          onChange={(event) => set({ price: event.target.value })}
          data-testid="variant-price"
        />
      </td>
      <td>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0}
          className="admin-input admin-input-small admin-tabular"
          aria-label={label('Compare-at price in rupees')}
          title={priceTitle}
          disabled={locked}
          value={draft.compareAtPrice}
          onChange={(event) => set({ compareAtPrice: event.target.value })}
          data-testid="variant-compare-at"
        />
        {locked && <span className="admin-hint">{ADMIN_ONLY_HINT}</span>}
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={label('Default variant')}
          checked={draft.isDefault}
          onChange={(event) => set({ isDefault: event.target.checked })}
        />
      </td>
      <td>
        <div className="admin-row-actions">
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-primary"
            disabled={busy || !dirty}
            onClick={() => void onSave(draft)}
            aria-label={label('Save')}
          >
            Save
          </button>
          {dirty && (
            <button
              type="button"
              className="admin-btn admin-btn-small"
              disabled={busy}
              onClick={() => setDraft(toDraft(variant))}
              aria-label={label('Discard changes')}
            >
              Discard
            </button>
          )}
          {!locked && (
            <button
              type="button"
              className="admin-btn admin-btn-small admin-btn-danger"
              disabled={busy}
              onClick={onDelete}
              aria-label={label('Delete')}
            >
              Delete
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
