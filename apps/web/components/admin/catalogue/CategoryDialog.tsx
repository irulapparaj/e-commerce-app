'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { categoryInputSchema } from '@pe/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';

import { Dialog } from '../Dialog';
import { FormField } from '../FormField';

import { fieldError } from './product-form';

type CategoryFormValues = z.input<typeof categoryInputSchema>;

export interface CategoryDialogTarget {
  readonly mode: 'create' | 'edit';
  readonly node: AdminCategoryNode | null;
  readonly parentId: string | null;
}

interface CategoryDialogProps {
  readonly target: CategoryDialogTarget | null;
  readonly roots: readonly AdminCategoryNode[];
  readonly onClose: () => void;
  readonly onSaved: (node: AdminCategoryNode) => void;
}

const emptyText = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const initialValues = (target: CategoryDialogTarget | null): CategoryFormValues => ({
  name: target?.node?.name ?? '',
  parentId: target?.node?.parentId ?? target?.parentId ?? null,
  metaTitle: target?.node?.metaTitle ?? null,
  metaDescription: target?.node?.metaDescription ?? null,
});

/** Create/edit a category (ADMIN). Slugs are generated server-side, so there is no slug field. */
export function CategoryDialog({ target, roots, onClose, onSaved }: CategoryDialogProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues: initialValues(target),
  });
  const { errors, isSubmitting } = form.formState;
  const { reset } = form;

  useEffect(() => {
    reset(initialValues(target));
    setFormError(null);
  }, [target, reset]);

  const submit = form.handleSubmit(async (values) => {
    const body = {
      ...values,
      parentId: emptyText(values.parentId),
      metaTitle: emptyText(values.metaTitle),
      metaDescription: emptyText(values.metaDescription),
    };
    try {
      const { data } =
        target?.mode === 'edit' && target.node !== null
          ? await adminApi.put<AdminCategoryNode>(`/admin/categories/${target.node.id}`, body)
          : await adminApi.post<AdminCategoryNode>('/admin/categories', body);
      onSaved(data);
    } catch (error) {
      setFormError(isAdminApiError(error) ? error.message : 'Could not save the category.');
    }
  });

  const editing = target?.mode === 'edit';
  const parentOptions = roots.filter((root) => root.id !== target?.node?.id);
  const isRootWithChildren = (target?.node?.children.length ?? 0) > 0;

  return (
    <Dialog
      open={target !== null}
      titleId="category-title"
      onClose={onClose}
      testId="category-dialog"
    >
      <form onSubmit={(event) => void submit(event)} className="admin-dialog-body" noValidate>
        <h2 id="category-title" className="admin-dialog-title">
          {editing ? `Edit ${target?.node?.name ?? 'category'}` : 'New category'}
        </h2>
        <FormField id="category-name" label="Name" error={fieldError(errors, 'name')}>
          {(control) => (
            <input
              {...control}
              type="text"
              className="admin-input"
              data-autofocus
              data-testid="category-name"
              {...form.register('name')}
            />
          )}
        </FormField>
        <FormField
          id="category-parent"
          label="Parent"
          help={
            isRootWithChildren
              ? 'A category with subcategories stays at the top level.'
              : 'Categories nest at most two levels.'
          }
          error={fieldError(errors, 'parentId')}
        >
          {(control) => (
            <select
              {...control}
              className="admin-select"
              disabled={isRootWithChildren}
              data-testid="category-parent"
              {...form.register('parentId', { setValueAs: emptyText })}
            >
              <option value="">Top level</option>
              {parentOptions.map((root) => (
                <option key={root.id} value={root.id}>
                  {root.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField
          id="category-meta-title"
          label="Meta title"
          error={fieldError(errors, 'metaTitle')}
        >
          {(control) => (
            <input
              {...control}
              type="text"
              className="admin-input"
              {...form.register('metaTitle', { setValueAs: emptyText })}
            />
          )}
        </FormField>
        <FormField
          id="category-meta-description"
          label="Meta description"
          error={fieldError(errors, 'metaDescription')}
        >
          {(control) => (
            <textarea
              {...control}
              className="admin-textarea"
              rows={2}
              {...form.register('metaDescription', { setValueAs: emptyText })}
            />
          )}
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
            data-testid="category-submit"
          >
            {isSubmitting ? 'Saving…' : editing ? 'Save' : 'Create category'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
