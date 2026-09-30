import Link from 'next/link';
import type { ReactNode } from 'react';

interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly href?: string;
  readonly tone?: 'default' | 'warning';
  readonly testId?: string;
}

const body = (label: string, value: string, hint: string | undefined): ReactNode => (
  <>
    <p className="admin-stat-label">{label}</p>
    <p className="admin-stat-value admin-tabular">{value}</p>
    {hint !== undefined && <p className="admin-stat-hint admin-muted">{hint}</p>}
  </>
);

export function StatTile({ label, value, hint, href, tone = 'default', testId }: StatTileProps) {
  return (
    <li className={`admin-stat admin-stat-${tone}`} data-testid={testId}>
      {href === undefined ? (
        body(label, value, hint)
      ) : (
        <Link href={href} className="admin-stat-link">
          {body(label, value, hint)}
        </Link>
      )}
    </li>
  );
}
