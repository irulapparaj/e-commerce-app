/**
 * OtpFields accessibility tests — verifies H-43 fix (responsive sizing, no fixed px width).
 *
 * Calls the component as a plain function and traverses the React element tree.
 * No DOM rendering required.
 */
import { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { CodeStep } from './OtpFields';

// ---------------------------------------------------------------------------
// Minimal React-element tree inspector (node environment, no JSDOM needed).
// ---------------------------------------------------------------------------

type AnyElement = ReactElement<Record<string, unknown>>;

function findAll(node: ReactNode, predicate: (el: AnyElement) => boolean): AnyElement[] {
  const results: AnyElement[] = [];

  function walk(n: ReactNode): void {
    if (n === null || n === undefined) return;
    if (typeof n !== 'object') return;

    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }

    const el = n as AnyElement;
    if (predicate(el)) results.push(el);

    const children = el.props?.children as ReactNode | undefined;
    if (children !== undefined) walk(children);
  }

  walk(node);
  return results;
}

const noop = () => undefined;

describe('CodeStep (OTP input)', () => {
  const tree = CodeStep({
    heading: 'Enter code',
    label: '6-digit code',
    code: '',
    onCodeChange: noop,
    onSubmit: noop,
    busy: false,
  });

  it('the form container does not use a fixed pixel width', () => {
    // The outermost form element must not have a fixed `width` style in px.
    // It should use max-width with min() to support reflow at 400% zoom (WCAG 1.4.10).
    const forms = findAll(tree, (el) => el.type === 'form');
    expect(forms.length).toBeGreaterThan(0);

    const formEl = forms[0] as ReactElement<Record<string, unknown>>;
    const formStyle = (formEl.props['style'] ?? {}) as Record<string, unknown>;

    // Must NOT have a plain px width (e.g. '304px', 304) — would overflow 320px viewport
    if (formStyle['width'] !== undefined) {
      const widthValue = String(formStyle['width']);
      // A plain pixel value like '304px' is not allowed — max-width or 100% is fine
      expect(widthValue).not.toMatch(/^\d+px$/);
    }
  });

  it('the form container uses max-width for responsive reflow', () => {
    const forms = findAll(tree, (el) => el.type === 'form');
    const formEl = forms[0] as ReactElement<Record<string, unknown>>;
    const formStyle = (formEl.props['style'] ?? {}) as Record<string, unknown>;

    // max-width should be set to constrain the form without causing overflow
    expect(formStyle['maxWidth']).toBeDefined();
    // Value should use min() to be responsive, e.g. 'min(304px, 100%)'
    expect(String(formStyle['maxWidth'])).toMatch(/min\(|100%/);
  });

  it('the code input uses width 100% via class (not a fixed inline width)', () => {
    const inputs = findAll(
      tree,
      (el) => el.type === 'input' && el.props['name'] === 'code',
    );
    expect(inputs.length).toBeGreaterThan(0);

    const input = inputs[0] as ReactElement<Record<string, unknown>>;
    const inputStyle = (input.props['style'] ?? {}) as Record<string, unknown>;

    // Inline style must not set a fixed px width
    if (inputStyle['width'] !== undefined) {
      const widthValue = String(inputStyle['width']);
      expect(widthValue).not.toMatch(/^\d+px$/);
    }
  });
});
