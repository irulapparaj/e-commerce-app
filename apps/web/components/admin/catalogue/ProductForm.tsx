'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';

import { type AdminApiError, adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminCategoryNode, AdminProductDetail } from '@/lib/admin/catalogue-types';

import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import {
  categoryOptions,
  changedCommercial,
  contentOf,
  type ProductFormInput,
  type ProductFormOutput,
  productFormSchema,
  toFormValues,
} from './product-form';
import { ProductCommercialFields } from './ProductCommercialFields';
import { ProductContentFields } from './ProductContentFields';
import { useUnsavedChangesGuard } from './useUnsavedChanges';

interface ProductFormProps {
  readonly product: AdminProductDetail | null;
  readonly categories: readonly AdminCategoryNode[];
  readonly role: AdminRole;
  readonly onSaved: (product: AdminProductDetail, mode: 'create' | 'edit') => void;
}

interface Issue {
  readonly path?: string;
  readonly message?: string;
}

type ProductFormApi = UseFormReturn<ProductFormInput, unknown, ProductFormOutput>;

const CANCELLED = 'Confirmation was cancelled; commercial changes were not saved.';
const GENERIC = 'Could not save. Try again.';
const FIX_FIELDS = 'Fix the highlighted fields.';

/** 400 VALIDATION details land on their fields; `prefix` re-roots commercial paths. */
const applyServerIssues = (form: ProductFormApi, error: AdminApiError, prefix = ''): string => {
  if (error.code !== 'VALIDATION' || !Array.isArray(error.details)) return error.message;
  const issues = (error.details as readonly Issue[]).filter(
    (issue) => typeof issue.path === 'string' && issue.path !== '',
  );
  for (const issue of issues)
    form.setError(`${prefix}${issue.path ?? ''}` as keyof ProductFormInput, {
      type: 'server',
      message: issue.message ?? 'Invalid',
    });
  return issues.length === 0 ? error.message : FIX_FIELDS;
};

const failureMessage = (error: unknown, form: ProductFormApi, prefix: string): string => {
  if (!isAdminApiError(error)) return GENERIC;
  if (error.code === 'STEP_UP_REQUIRED') return CANCELLED;
  return applyServerIssues(form, error, prefix);
};

/** Create (`POST`) or edit; edits are one content PATCH plus a commercial PATCH only when needed. */
export function ProductForm({ product, categories, role, onSaved }: ProductFormProps) {
  const { notify } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const options = useMemo(() => categoryOptions(categories), [categories]);
  const form = useForm<ProductFormInput, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: toFormValues(product),
  });
  const { isDirty, isSubmitting } = form.formState;
  useUnsavedChangesGuard(isDirty);

  const create = async (values: ProductFormOutput) => {
    const { data } = await adminApi.post<AdminProductDetail>('/admin/products', contentOf(values));
    form.reset(toFormValues(data));
    onSaved(data, 'create');
  };

  const edit = async (values: ProductFormOutput, current: AdminProductDetail) => {
    const { data: afterContent } = await adminApi.patch<AdminProductDetail>(
      `/admin/products/${current.id}/content`,
      contentOf(values),
    );
    const commercialPatch =
      role === 'ADMIN'
        ? changedCommercial(toFormValues(current).commercial, values.commercial)
        : {};
    let latest = afterContent;
    if (Object.keys(commercialPatch).length > 0) {
      try {
        latest = (
          await adminApi.patch<AdminProductDetail>(
            `/admin/products/${current.id}/commercial`,
            commercialPatch,
          )
        ).data;
      } catch (error) {
        form.reset(toFormValues(afterContent), { keepDirtyValues: true });
        onSaved(afterContent, 'edit');
        setFormError(failureMessage(error, form, 'commercial.'));
        return;
      }
    }
    form.reset(toFormValues(latest));
    setSaved(true);
    notify('Saved', 'success');
    onSaved(latest, 'edit');
  };

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    setSaved(false);
    try {
      if (product === null) await create(values);
      else await edit(values, product);
    } catch (error) {
      setFormError(failureMessage(error, form, ''));
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-labelledby="page-title"
      data-testid="product-form"
    >
      <ProductContentFields form={form} categories={options} />
      {product !== null && <ProductCommercialFields form={form} role={role} />}
      {formError !== null && (
        <p role="alert" className="admin-error" data-testid="product-form-error">
          {formError}
        </p>
      )}
      <div className="admin-form-footer">
        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          disabled={isSubmitting}
          data-testid="product-save"
        >
          {isSubmitting ? 'Saving…' : product === null ? 'Create product' : 'Save'}
        </button>
        <span
          className={
            isDirty
              ? 'admin-form-status admin-form-status-dirty'
              : 'admin-form-status admin-form-status-saved'
          }
          aria-live="polite"
          data-testid="product-form-status"
        >
          {isDirty ? 'Unsaved changes' : saved ? 'Saved' : ''}
        </span>
      </div>
    </form>
  );
}
