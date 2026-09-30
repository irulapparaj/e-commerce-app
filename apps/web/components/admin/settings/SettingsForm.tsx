'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { SettingKey } from '@pe/shared';
import { useState } from 'react';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';

import { type AdminApiError, adminApi, isAdminApiError } from '@/lib/admin/api';

import { useToast } from '../Toast';

import { FORM_SCHEMAS, fromFormValues, SETTING_FIELDS, SETTING_META, toFormValues } from './fields';
import { SettingField } from './SettingField';

interface SettingsFormProps {
  readonly settingKey: SettingKey;
  readonly initialValue: unknown;
  readonly onSaved: (key: SettingKey, value: unknown) => void;
}

interface Issue {
  readonly path?: string;
  readonly message?: string;
}

const CANCELLED = 'Confirmation was cancelled; nothing was saved.';
const GENERIC = 'Could not save. Try again.';

/** Maps the API's 400 VALIDATION details onto the matching fields; anything else is a form-level error. */
const applyServerIssues = (
  form: UseFormReturn<FieldValues, unknown, FieldValues>,
  error: AdminApiError,
): string => {
  if (error.code !== 'VALIDATION' || !Array.isArray(error.details)) return error.message;
  const issues = (error.details as readonly Issue[]).filter(
    (issue) => typeof issue.path === 'string',
  );
  for (const issue of issues)
    form.setError(issue.path?.replace(/^value\./, '') ?? '', {
      type: 'server',
      message: issue.message ?? 'Invalid',
    });
  return issues.length === 0 ? error.message : 'Fix the highlighted fields.';
};

export function SettingsForm({ settingKey, initialValue, onSaved }: SettingsFormProps) {
  const { notify } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FieldValues, unknown, FieldValues>({
    resolver: zodResolver(FORM_SCHEMAS[settingKey]),
    defaultValues: toFormValues(settingKey, initialValue),
  });

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { data } = await adminApi.put<unknown>(`/admin/settings/${settingKey}`, {
        value: fromFormValues(settingKey, values),
      });
      notify('Saved', 'success');
      onSaved(settingKey, data);
      form.reset(toFormValues(settingKey, data));
    } catch (error) {
      if (!isAdminApiError(error)) return setFormError(GENERIC);
      setFormError(error.code === 'STEP_UP_REQUIRED' ? CANCELLED : applyServerIssues(form, error));
    }
  });

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="admin-form"
      noValidate
      aria-labelledby={`settings-heading-${settingKey}`}
      data-testid={`settings-form-${settingKey}`}
    >
      <h2 id={`settings-heading-${settingKey}`} className="admin-section-title">
        {SETTING_META[settingKey].title}
      </h2>
      <p className="admin-muted" style={{ margin: '0 0 1rem' }}>
        {SETTING_META[settingKey].description}
      </p>
      {SETTING_FIELDS[settingKey].map((field) => (
        <SettingField key={field.name} settingKey={settingKey} field={field} form={form} />
      ))}
      {formError !== null && (
        <p role="alert" className="admin-error" data-testid="settings-form-error">
          {formError}
        </p>
      )}
      <div className="admin-form-actions">
        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          disabled={form.formState.isSubmitting}
          data-testid="settings-save"
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save'}
        </button>
        {form.formState.isDirty && <span className="admin-muted">Unsaved changes</span>}
      </div>
    </form>
  );
}
