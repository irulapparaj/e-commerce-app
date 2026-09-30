import { describe, expect, it } from 'vitest';

import { compareLedger } from './ledger-check';

describe('compareLedger', () => {
  it('reports only variants whose cached stock differs from the ledger sum', () => {
    const result = compareLedger([
      { variantId: 'a', sku: 'A', stock: 10, ledger: 10 },
      { variantId: 'b', sku: 'B', stock: 12, ledger: 10 },
      { variantId: 'c', sku: 'C', stock: 0, ledger: 3 },
    ]);

    expect(result.checked).toBe(3);
    expect(result.drift).toEqual([
      { variantId: 'b', sku: 'B', stock: 12, ledger: 10, difference: 2 },
      { variantId: 'c', sku: 'C', stock: 0, ledger: 3, difference: -3 },
    ]);
  });

  it('handles an empty catalogue', () => {
    expect(compareLedger([])).toEqual({ checked: 0, drift: [] });
  });
});
