/**
 * FreeShippingBar accessibility tests.
 *
 * These tests call the component as a plain function and traverse the React
 * element tree — no DOM rendering required.
 */
import { type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { FreeShippingBar } from './FreeShippingBar';

// ---------------------------------------------------------------------------
// Minimal React-element tree inspector (node environment, no JSDOM needed).
// ---------------------------------------------------------------------------

type AnyElement = ReactElement<Record<string, unknown>>;

function findByRole(node: ReactNode, role: string): AnyElement | null {
  if (node === null || node === undefined) return null;
  if (typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByRole(child, role);
      if (found) return found;
    }
    return null;
  }

  const el = node as AnyElement;
  if (el.props?.role === role) return el;

  const children = el.props?.children as ReactNode | undefined;
  if (children !== undefined) {
    return findByRole(children, role);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FreeShippingBar', () => {
  it('renders a progressbar role element', () => {
    const tree = FreeShippingBar({ spent: 30000, amountToFree: 50000 });
    const progressbar = findByRole(tree, 'progressbar');
    expect(progressbar).not.toBeNull();
  });

  it('progressbar has aria-valuenow, aria-valuemin, aria-valuemax', () => {
    const tree = FreeShippingBar({ spent: 30000, amountToFree: 50000 });
    const progressbar = findByRole(tree, 'progressbar');
    expect(progressbar).not.toBeNull();
    expect(progressbar!.props['aria-valuenow']).toBe(60);
    expect(progressbar!.props['aria-valuemin']).toBe(0);
    expect(progressbar!.props['aria-valuemax']).toBe(100);
  });

  it('progressbar has an accessible aria-label', () => {
    const tree = FreeShippingBar({ spent: 10000, amountToFree: 50000 });
    const progressbar = findByRole(tree, 'progressbar');
    expect(progressbar).not.toBeNull();
    expect(typeof progressbar!.props['aria-label']).toBe('string');
    expect((progressbar!.props['aria-label'] as string).length).toBeGreaterThan(0);
  });

  it('clamps aria-valuenow to 100 when spent exceeds the threshold', () => {
    const tree = FreeShippingBar({ spent: 70000, amountToFree: 50000 });
    const progressbar = findByRole(tree, 'progressbar');
    expect(progressbar).not.toBeNull();
    expect(progressbar!.props['aria-valuenow']).toBe(100);
  });

  it('shows 0 progress when nothing has been spent', () => {
    const tree = FreeShippingBar({ spent: 0, amountToFree: 50000 });
    const progressbar = findByRole(tree, 'progressbar');
    expect(progressbar).not.toBeNull();
    expect(progressbar!.props['aria-valuenow']).toBe(0);
  });
});
