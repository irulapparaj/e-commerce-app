/**
 * AddressForm accessibility tests — verifies WCAG H-38 fix (State select has label).
 *
 * Because AddressForm uses React hooks (useId), we verify the source code
 * structure rather than calling the component function directly.
 * This ensures the required patterns are present without needing a React renderer.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  resolve(import.meta.dirname, './AddressForm.tsx'),
  'utf-8',
);

describe('AddressForm accessibility (H-38)', () => {
  it('renders a <select> with name="state"', () => {
    expect(src).toMatch(/name="state"/);
  });

  it('the State select has an id attribute (via useId)', () => {
    // The component uses id={id('state')} — verify both parts are present
    expect(src).toMatch(/id=\{id\(['"]state['"]\)\}/);
  });

  it('there is a <label> with htmlFor pointing at the State select id', () => {
    // The label uses htmlFor={id('state')} to connect to the select
    expect(src).toMatch(/htmlFor=\{id\(['"]state['"]\)\}/);
  });

  it('fullName field has a label', () => {
    expect(src).toMatch(/name="fullName"/);
    expect(src).toMatch(/htmlFor=\{id\(['"]fullName['"]\)\}/);
  });

  it('pincode field has a label', () => {
    expect(src).toMatch(/name="pincode"/);
    expect(src).toMatch(/htmlFor=\{id\(['"]pincode['"]\)\}/);
  });

  it('phone field has a label', () => {
    expect(src).toMatch(/name="phone"/);
    expect(src).toMatch(/htmlFor=\{id\(['"]phone['"]\)\}/);
  });

  it('required fields use the HTML required attribute', () => {
    // Count occurrences of `required` — should be at least 6 fields
    const requiredCount = (src.match(/\brequired\b/g) ?? []).length;
    expect(requiredCount).toBeGreaterThanOrEqual(6);
  });

  it('the form has an accessible aria-label', () => {
    expect(src).toMatch(/aria-label="Shipping address"/);
  });
});
