'use client';

import { GST_RATES, HSN_CODES } from '@pe/shared';
import type { UseFormReturn } from 'react-hook-form';

import { FormField } from '../FormField';
import type { AdminRole } from '../Nav.config';

import {
  ADMIN_ONLY_HINT,
  fieldError,
  type ProductFormInput,
  type ProductFormOutput,
} from './product-form';

interface ProductCommercialFieldsProps {
  readonly form: UseFormReturn<ProductFormInput, unknown, ProductFormOutput>;
  readonly role: AdminRole;
}

const META_ROWS = 2;

const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** HSN, GST rate, featured flag and SEO: ADMIN with step-up; STAFF sees them read-only. */
export function ProductCommercialFields({ form, role }: ProductCommercialFieldsProps) {
  const { errors } = form.formState;
  const locked = role !== 'ADMIN';
  const hint = locked ? <span className="admin-hint">{ADMIN_ONLY_HINT}</span> : null;
  return (
    <section className="admin-form-section" aria-labelledby="product-commercial-heading">
      <h2 id="product-commercial-heading" className="admin-form-section-title">
        Tax, featuring and SEO {hint}
      </h2>
      {locked && (
        <p className="admin-muted admin-form-section-note" data-testid="commercial-locked">
          Only an administrator can change these fields.
        </p>
      )}
      <div className="admin-form-grid">
        <FormField
          id="product-hsn"
          label="HSN code"
          help="4, 6 or 8 digits."
          error={fieldError(errors, 'commercial.hsnCode')}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              inputMode="numeric"
              className="admin-input admin-tabular"
              list="product-hsn-codes"
              disabled={locked}
              data-testid="product-hsn"
              {...form.register('commercial.hsnCode')}
            />
          )}
        </FormField>
        <datalist id="product-hsn-codes">
          {HSN_CODES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.description}
            </option>
          ))}
        </datalist>
        <FormField
          id="product-gst"
          label="GST rate"
          error={fieldError(errors, 'commercial.gstRate')}
        >
          {(control) => (
            <select
              {...control}
              className="admin-select"
              disabled={locked}
              data-testid="product-gst"
              {...form.register('commercial.gstRate', { valueAsNumber: true })}
            >
              {GST_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      <FormField
        id="product-featured"
        label="Featured on the storefront"
        inline
        error={fieldError(errors, 'commercial.isFeatured')}
      >
        {(control) => (
          <input
            {...control}
            type="checkbox"
            disabled={locked}
            data-testid="product-featured"
            {...form.register('commercial.isFeatured')}
          />
        )}
      </FormField>
      <FormField
        id="product-meta-title"
        label="Meta title"
        help="Up to 70 characters; falls back to the product name."
        error={fieldError(errors, 'commercial.metaTitle')}
      >
        {(control) => (
          <input
            {...control}
            type="text"
            className="admin-input"
            disabled={locked}
            data-testid="product-meta-title"
            {...form.register('commercial.metaTitle', { setValueAs: emptyToNull })}
          />
        )}
      </FormField>
      <FormField
        id="product-meta-description"
        label="Meta description"
        help="Up to 160 characters."
        error={fieldError(errors, 'commercial.metaDescription')}
      >
        {(control) => (
          <textarea
            {...control}
            className="admin-textarea"
            rows={META_ROWS}
            disabled={locked}
            data-testid="product-meta-description"
            {...form.register('commercial.metaDescription', { setValueAs: emptyToNull })}
          />
        )}
      </FormField>
    </section>
  );
}
