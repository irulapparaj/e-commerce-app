'use client';

import {
  Controller,
  type FieldErrors,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';

import { FormField } from '../FormField';

import type { FieldDef } from './fields';

interface SettingFieldProps {
  readonly settingKey: string;
  readonly field: FieldDef;
  readonly form: UseFormReturn<FieldValues, unknown, FieldValues>;
}

export const errorMessage = (errors: FieldErrors, name: string): string | null => {
  const entry: unknown = errors[name];
  if (typeof entry !== 'object' || entry === null || !('message' in entry)) return null;
  const message: unknown = entry.message;
  return typeof message === 'string' ? message : null;
};

const emptyTo = (field: FieldDef) => (value: unknown) =>
  value === ''
    ? field.nullable === true
      ? null
      : field.optional === true
        ? undefined
        : value
    : value;

const toStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export function SettingField({ settingKey, field, form }: SettingFieldProps) {
  const id = `${settingKey}-${field.name}`;
  const error = errorMessage(form.formState.errors, field.name);
  const common = {
    id,
    label: field.label,
    error,
    ...(field.help === undefined ? {} : { help: field.help }),
  };

  if (field.kind === 'checkbox') {
    return (
      <FormField {...common} inline>
        {(control) => <input {...control} type="checkbox" {...form.register(field.name)} />}
      </FormField>
    );
  }
  if (field.kind === 'number') {
    return (
      <FormField {...common}>
        {(control) => (
          <input
            {...control}
            type="number"
            inputMode="numeric"
            className="admin-input admin-tabular"
            {...form.register(field.name, { valueAsNumber: true })}
          />
        )}
      </FormField>
    );
  }
  if (field.kind === 'lines') {
    return (
      <FormField {...common}>
        {(control) => (
          <textarea
            {...control}
            className="admin-textarea"
            rows={4}
            {...form.register(field.name)}
          />
        )}
      </FormField>
    );
  }
  if (field.kind === 'checkbox-group') {
    return (
      <Controller
        control={form.control}
        name={field.name}
        render={({ field: controller }) => {
          const selected = toStringArray(controller.value);
          return (
            <fieldset
              className="admin-checkbox-group"
              aria-describedby={error === null ? undefined : `${id}-error`}
            >
              <legend>{field.label}</legend>
              {(field.options ?? []).map((option) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={(event) =>
                      controller.onChange(
                        event.target.checked
                          ? [...selected, option]
                          : selected.filter((item) => item !== option),
                      )
                    }
                  />
                  {option}
                </label>
              ))}
              {error !== null && (
                <p id={`${id}-error`} className="admin-error" role="alert">
                  {error}
                </p>
              )}
            </fieldset>
          );
        }}
      />
    );
  }
  return (
    <FormField {...common}>
      {(control) => (
        <input
          {...control}
          type="text"
          className="admin-input"
          readOnly={field.kind === 'readonly'}
          {...form.register(field.name, { setValueAs: emptyTo(field) })}
        />
      )}
    </FormField>
  );
}
