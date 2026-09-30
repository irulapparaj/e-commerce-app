// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './FormField';

describe('FormField', () => {
  it('wires label, help and error through aria-describedby and aria-invalid', () => {
    render(
      <FormField id="name" label="Name" help="Shown on invoices" error="Required">
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Name');

    expect(input).toHaveAttribute('aria-describedby', 'name-help name-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Shown on invoices')).toHaveAttribute('id', 'name-help');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('omits the aria attributes when there is nothing to describe', () => {
    render(
      <FormField id="plain" label="Plain" error={null}>
        {(control) => <input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Plain');

    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders inline controls before their label', () => {
    render(
      <FormField id="enabled" label="Enabled" inline>
        {(control) => <input type="checkbox" {...control} />}
      </FormField>,
    );
    const field = screen.getByLabelText('Enabled').parentElement;

    expect(field).toHaveClass('admin-field-inline');
    expect(field?.firstElementChild?.tagName).toBe('INPUT');
  });
});
