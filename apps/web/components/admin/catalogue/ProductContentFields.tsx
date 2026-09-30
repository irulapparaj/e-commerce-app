'use client';

import type { RichTextDocument } from '@pe/shared';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { FormField } from '../FormField';

import {
  type CategoryOption,
  fieldError,
  type ProductFormInput,
  type ProductFormOutput,
} from './product-form';
import { RichTextEditor } from './RichTextEditor';
import { SpecificationsEditor } from './SpecificationsEditor';
import { TagsInput } from './TagsInput';

interface ProductContentFieldsProps {
  readonly form: UseFormReturn<ProductFormInput, unknown, ProductFormOutput>;
  readonly categories: readonly CategoryOption[];
}

const HOW_TO_USE_ROWS = 4;

const emptyToNull = (value: unknown) => (value === '' ? null : value);

/** Fields STAFF may edit: name, SKU, category, description, specifications, how-to-use, tags. */
export function ProductContentFields({ form, categories }: ProductContentFieldsProps) {
  const { errors } = form.formState;
  return (
    <section className="admin-form-section" aria-labelledby="product-content-heading">
      <h2 id="product-content-heading" className="admin-form-section-title">
        Content
      </h2>
      <div className="admin-form-grid">
        <FormField id="product-name" label="Name" error={fieldError(errors, 'name')}>
          {(control) => (
            <input
              {...control}
              type="text"
              className="admin-input"
              data-testid="product-name"
              {...form.register('name')}
            />
          )}
        </FormField>
        <FormField
          id="product-sku"
          label="Product SKU"
          help="Letters, digits, dots, hyphens and underscores."
          error={fieldError(errors, 'sku')}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              className="admin-input admin-mono"
              data-testid="product-sku"
              {...form.register('sku')}
            />
          )}
        </FormField>
        <FormField id="product-category" label="Category" error={fieldError(errors, 'categoryId')}>
          {(control) => (
            <select
              {...control}
              className="admin-select"
              data-testid="product-category"
              {...form.register('categoryId')}
            >
              <option value="">Choose a category…</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>
      <div className="admin-field">
        <span id="product-description-label" className="admin-label">
          Description
        </span>
        <Controller
          control={form.control}
          name="description"
          render={({ field, fieldState }) => (
            <RichTextEditor
              id="product-description"
              labelledBy="product-description-label"
              // Zod's lazy list schema widens the *input* type to unknown[]; the value is a document.
              value={field.value as RichTextDocument}
              onChange={field.onChange}
              invalid={fieldState.error !== undefined}
              {...(fieldState.error === undefined
                ? {}
                : { describedBy: 'product-description-error' })}
            />
          )}
        />
        {fieldError(errors, 'description') !== null && (
          <p id="product-description-error" className="admin-error" role="alert">
            {fieldError(errors, 'description')}
          </p>
        )}
      </div>
      <div className="admin-field">
        <span id="product-specs-label" className="admin-label">
          Specifications
        </span>
        <Controller
          control={form.control}
          name="specifications"
          render={({ field }) => (
            <SpecificationsEditor
              id="product-specs"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {fieldError(errors, 'specifications') !== null && (
          <p className="admin-error" role="alert">
            Every specification needs a name and a value.
          </p>
        )}
      </div>
      <FormField
        id="product-how-to-use"
        label="How to use"
        help="Optional plain text shown under the description."
        error={fieldError(errors, 'howToUse')}
      >
        {(control) => (
          <textarea
            {...control}
            className="admin-textarea"
            rows={HOW_TO_USE_ROWS}
            data-testid="product-how-to-use"
            {...form.register('howToUse', { setValueAs: emptyToNull })}
          />
        )}
      </FormField>
      <FormField id="product-tags" label="Tags" error={fieldError(errors, 'tags')}>
        {(control) => (
          <Controller
            control={form.control}
            name="tags"
            render={({ field, fieldState }) => (
              <TagsInput
                id={control.id}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.error !== undefined}
                {...(control['aria-describedby'] === undefined
                  ? {}
                  : { describedBy: control['aria-describedby'] })}
              />
            )}
          />
        )}
      </FormField>
    </section>
  );
}
