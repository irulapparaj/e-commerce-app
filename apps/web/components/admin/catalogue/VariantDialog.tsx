'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminVariant } from '@/lib/admin/catalogue-types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';

import { fieldError } from './product-form';
import {
  toCreateBody,
  type VariantCreateFormInput,
  type VariantCreateFormOutput,
  variantCreateFormSchema,
} from './variant-form';

interface VariantDialogProps {
  readonly open: boolean;
  readonly productId: string;
  readonly onClose: () => void;
  readonly onCreated: (variant: AdminVariant) => void;
}

const CANCELLED = 'Confirmation was cancelled; the variant was not created.';
const DEFAULT_THRESHOLD = 5;
/** Untouched or cleared optional number inputs reach the resolver as '', null or undefined. */
const nullableNumber = (value: unknown) =>
  value === '' || value === null || value === undefined ? null : Number(value);

const DEFAULTS: VariantCreateFormInput = {
  sku: '',
  label: '',
  weightGrams: 0,
  isDefault: false,
  lowStockThreshold: DEFAULT_THRESHOLD,
  price: 0,
  compareAtPrice: null,
};

/** `POST /admin/products/:id/variants` (ADMIN ⚡ because it sets a price). */
export function VariantDialog({ open, productId, onClose, onCreated }: VariantDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<VariantCreateFormInput, unknown, VariantCreateFormOutput>({
    resolver: zodResolver(variantCreateFormSchema),
    defaultValues: DEFAULTS,
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await adminApi.post<AdminVariant>(
        `/admin/products/${productId}/variants`,
        toCreateBody(values),
      );
      form.reset(DEFAULTS);
      onCreated(data);
    } catch (error) {
      if (!isAdminApiError(error)) return setFormError('Could not create the variant. Try again.');
      setFormError(error.code === 'STEP_UP_REQUIRED' ? CANCELLED : error.message);
    }
  });

  const numeric = (name: 'weightGrams' | 'lowStockThreshold' | 'price') =>
    form.register(name, { valueAsNumber: true });

  return (
    <Dialog open={open} titleId="variant-title" onClose={onClose} testId="variant-dialog">
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body" noValidate>
        <h2 id="variant-title" className="admin-dialog-title">
          Add a variant
        </h2>
        <div className="admin-form-grid">
          <FormField id="variant-sku" label="SKU" error={fieldError(errors, 'sku')}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="admin-input admin-mono"
                data-autofocus
                data-testid="variant-new-sku"
                {...form.register('sku')}
              />
            )}
          </FormField>
          <FormField id="variant-label" label="Label" error={fieldError(errors, 'label')}>
            {(control) => (
              <input
                {...control}
                type="text"
                className="admin-input"
                data-testid="variant-new-label"
                {...form.register('label')}
              />
            )}
          </FormField>
          <FormField
            id="variant-weight"
            label="Weight (grams)"
            error={fieldError(errors, 'weightGrams')}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={1}
                className="admin-input admin-tabular"
                data-testid="variant-new-weight"
                {...numeric('weightGrams')}
              />
            )}
          </FormField>
          <FormField
            id="variant-threshold"
            label="Low-stock threshold"
            error={fieldError(errors, 'lowStockThreshold')}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                className="admin-input admin-tabular"
                {...numeric('lowStockThreshold')}
              />
            )}
          </FormField>
          <FormField id="variant-price" label="Price (₹)" error={fieldError(errors, 'price')}>
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                className="admin-input admin-tabular"
                data-testid="variant-new-price"
                {...numeric('price')}
              />
            )}
          </FormField>
          <FormField
            id="variant-compare-at"
            label="Compare-at price (₹)"
            help="Optional strike-through price; must exceed the price."
            error={fieldError(errors, 'compareAtPrice')}
          >
            {(control) => (
              <input
                {...control}
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0}
                className="admin-input admin-tabular"
                data-testid="variant-new-compare-at"
                {...form.register('compareAtPrice', { setValueAs: nullableNumber })}
              />
            )}
          </FormField>
        </div>
        <FormField id="variant-default" label="Default variant" inline>
          {(control) => <input {...control} type="checkbox" {...form.register('isDefault')} />}
        </FormField>
        {formError !== null && (
          <p role="alert" className="admin-error">
            {formError}
          </p>
        )}
        <div className="admin-dialog-actions">
          <button type="button" className="admin-btn" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={isSubmitting}
            data-testid="variant-new-submit"
          >
            {isSubmitting ? 'Creating…' : 'Create variant'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
