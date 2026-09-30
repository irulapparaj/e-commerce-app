export interface LedgerRow {
  readonly variantId: string;
  readonly sku: string;
  readonly stock: number;
  readonly ledger: number;
}

export interface LedgerDrift extends LedgerRow {
  readonly difference: number;
}

export interface LedgerCheckResult {
  readonly checked: number;
  readonly drift: readonly LedgerDrift[];
}

/** Pure comparison of the cached `stock` against `SUM(delta)` per variant (R7). Report only; no healing. */
export const compareLedger = (rows: readonly LedgerRow[]): LedgerCheckResult => ({
  checked: rows.length,
  drift: rows
    .filter((row) => row.stock !== row.ledger)
    .map((row) => ({ ...row, difference: row.stock - row.ledger })),
});
