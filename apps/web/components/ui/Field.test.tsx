// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Checkbox, Radio } from './Choice';
import { Field } from './Field';
import { Input, Select, Textarea } from './Input';

describe('Field', () => {
  it('labels the control and wires help text through aria-describedby', () => {
    render(
      <Field label="Email address" help="Order updates only.">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email address');

    expect(input).toHaveAccessibleDescription('Order updates only.');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toBeRequired();
  });

  it('marks the control invalid and required and announces the error', () => {
    render(
      <Field label="Pincode" error="Enter a six-digit pincode." help="Delivery area" required>
        <Input inputMode="numeric" />
      </Field>,
    );
    const input = screen.getByLabelText(/Pincode/);

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toBeRequired();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a six-digit pincode.');
    expect(input).toHaveAccessibleDescription('Delivery area Enter a six-digit pincode.');
  });

  it('lets explicit ids and aria win over the context, and hides the label visually on request', () => {
    render(
      <Field label="Search" id="site-search" hideLabel error="x">
        <Input id="site-search" aria-invalid={false} aria-describedby="hint" />
      </Field>,
    );
    const input = screen.getByLabelText('Search');

    expect(input).toHaveAttribute('id', 'site-search');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).toHaveAttribute('aria-describedby', 'hint');
    expect(screen.getByText('Search')).toHaveClass('sr-only');
  });

  it('applies to Textarea and Select too, and both render bare without a Field', () => {
    render(
      <>
        <Field label="Notes">
          <Textarea />
        </Field>
        <Field label="Sort">
          <Select>
            <option>A</option>
          </Select>
        </Field>
        <Input aria-label="bare" />
        <Textarea aria-label="bare-text" />
        <Select aria-label="bare-select">
          <option>B</option>
        </Select>
      </>,
    );

    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Sort').tagName).toBe('SELECT');
    expect(screen.getByLabelText('bare')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('bare-text')).toHaveAttribute('rows', '4');
    expect(screen.getByLabelText('bare-select')).toHaveClass('appearance-none');
  });
});

describe('Checkbox and Radio', () => {
  it('associate the label and description with the native input', () => {
    render(
      <>
        <Checkbox label="Email me" description="Once a month." defaultChecked />
        <Radio name="delivery" label="Express" id="express" />
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Email me' });
    const radio = screen.getByRole('radio', { name: 'Express' });

    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription('Once a month.');
    expect(radio).toHaveAttribute('id', 'express');
    expect(radio).not.toHaveAttribute('aria-describedby');
  });
});
