import Link from 'next/link';

import type { StockRow } from '@/lib/admin/catalogue-types';
import { formatCount } from '@/lib/admin/format';

interface LowStockListProps {
  readonly rows: readonly StockRow[];
  readonly limit?: number;
}

const DEFAULT_LIMIT = 8;

/** Compact list linked from the dashboard tile; the full table is the stock page itself. */
export function LowStockList({ rows, limit = DEFAULT_LIMIT }: LowStockListProps) {
  const shown = rows.slice(0, limit);
  return (
    <section className="admin-panel" aria-labelledby="low-stock-title" data-testid="low-stock-list">
      <h2 id="low-stock-title" className="admin-panel-title">
        Low stock ({formatCount(rows.length)})
      </h2>
      {shown.length === 0 ? (
        <p className="admin-muted">Every variant is above its threshold.</p>
      ) : (
        <ul className="admin-low-list">
          {shown.map((row) => (
            <li key={row.variantId} className="admin-low-item">
              <Link href={`/admin/inventory?q=${encodeURIComponent(row.sku)}`}>
                {row.productName} · {row.label}
              </Link>
              <span className="admin-tabular">
                {formatCount(row.stock)} / {formatCount(row.lowStockThreshold)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length && (
        <Link href="/admin/inventory?belowThreshold=true" className="admin-stat-link">
          See all {formatCount(rows.length)}
        </Link>
      )}
    </section>
  );
}
