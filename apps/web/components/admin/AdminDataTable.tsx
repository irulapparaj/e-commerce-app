'use client';

import { type ReactNode } from 'react';

interface Column<T> {
  readonly key: string;
  readonly header: string;
  /** When provided this column renders as a link to make the row keyboard-accessible. */
  readonly href?: (row: T) => string;
  readonly render: (row: T) => ReactNode;
}

interface AdminDataTableProps<T extends { id: string }> {
  readonly caption: string;
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly emptyMessage?: string;
}

/**
 * Accessible admin data table.
 *
 * Accessibility (H-41):
 *   - The primary column cell renders as an <a> link so the row is operable
 *     via keyboard and exposes proper link semantics to screen readers.
 *   - No onClick-only <tr> elements — navigation is expressed via <a href>.
 *   - <caption> provides an accessible table name.
 */
export function AdminDataTable<T extends { id: string }>({
  caption,
  columns,
  rows,
  emptyMessage = 'No records found.',
}: AdminDataTableProps<T>) {
  const linkColumn = columns.find((col) => col.href !== undefined);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--text-small)',
        }}
      >
        <caption style={{ textAlign: 'left', marginBottom: 'var(--space-1)', fontWeight: 600 }}>
          {caption}
        </caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '0.5rem 0.75rem',
                  borderBottom: '1px solid var(--hairline)',
                  fontWeight: 600,
                  color: 'var(--muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  fontSize: '0.7rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                  color: 'var(--muted)',
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                style={{
                  borderBottom: '1px solid var(--hairline)',
                  transition: `background var(--duration-fast) var(--ease-out)`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = 'var(--hairline)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = '';
                }}
              >
                {columns.map((col) => {
                  const isLinkCol = col.key === linkColumn?.key;
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '0.625rem 0.75rem',
                        verticalAlign: 'middle',
                      }}
                    >
                      {/* H-41: Primary column uses <a> for proper keyboard navigation */}
                      {isLinkCol && col.href ? (
                        <a
                          href={col.href(row)}
                          style={{
                            color: 'inherit',
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          {col.render(row)}
                        </a>
                      ) : (
                        col.render(row)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
