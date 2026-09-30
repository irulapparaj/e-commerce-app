'use client';

import { type KeyboardEvent, type ReactNode, useState } from 'react';

import { EmptyState } from './EmptyState';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly key: string;
  readonly direction: SortDirection;
}

export interface PaginationState {
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface TableQuery {
  readonly page: number;
  readonly sort: SortState | null;
  readonly filters: Readonly<Record<string, string>>;
}

export interface Column<Row> {
  readonly key: string;
  readonly header: string;
  readonly render?: (row: Row) => ReactNode;
  /** When set, cell content is wrapped in an `<a>` providing link semantics for AT. */
  readonly href?: (row: Row) => string;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly align?: 'start' | 'end';
}

interface DataTableProps<Row> {
  readonly columns: readonly Column<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  /** Visually hidden `<caption>` naming the table for assistive tech. */
  readonly caption: string;
  readonly pagination?: PaginationState;
  readonly sort?: SortState | null;
  readonly filters?: Readonly<Record<string, string>>;
  readonly onChange?: (query: TableQuery) => void;
  readonly onRowActivate?: (row: Row) => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly rowTestId?: string;
}

const NO_FILTERS: Readonly<Record<string, string>> = {};

const text = (raw: unknown): string => {
  if (raw === null || raw === undefined) return '—';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint')
    return String(raw);
  return JSON.stringify(raw);
};

const cellContent = <Row,>(row: Row, column: Column<Row>): ReactNode =>
  column.render === undefined
    ? text((row as Record<string, unknown>)[column.key])
    : column.render(row);

const cellValue = <Row,>(row: Row, column: Column<Row>): ReactNode => {
  const content = cellContent(row, column);
  if (column.href === undefined) return content;
  return (
    <a href={column.href(row)} className="admin-row-link" tabIndex={-1}>
      {content}
    </a>
  );
};

const nextSort = (current: SortState | null | undefined, key: string): SortState =>
  current?.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };

const ariaSort = (sort: SortState | null | undefined, key: string) =>
  sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

const pageCount = ({ limit, total }: PaginationState): number =>
  Math.max(1, Math.ceil(total / Math.max(1, limit)));

const ROW_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
  'Enter',
  ' ',
]);

/** Server-driven table: sort, per-column filters and paging emit one `TableQuery` via `onChange`. */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  pagination,
  sort = null,
  filters = NO_FILTERS,
  onChange,
  onRowActivate,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  rowTestId = 'table-row',
}: DataTableProps<Row>) {
  const [focusIndex, setFocusIndex] = useState(0);
  const hasFilters = columns.some((column) => column.filterable === true);
  const interactive = onRowActivate !== undefined;
  const emit = (query: Partial<TableQuery>) =>
    onChange?.({ page: pagination?.page ?? 1, sort, filters, ...query });

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (!ROW_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') {
      const row = rows[index];
      if (row !== undefined) onRowActivate?.(row);
      return;
    }
    const last = rows.length - 1;
    const target =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : Math.min(last, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)));
    setFocusIndex(target);
    const body = event.currentTarget.parentElement;
    body?.querySelectorAll<HTMLTableRowElement>('tr')[target]?.focus();
  };

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="admin-visually-hidden">{caption}</caption>
        <thead>
          <HeaderRow
            columns={columns}
            sort={sort}
            onSort={(key) => emit({ page: 1, sort: nextSort(sort, key) })}
          />
          {hasFilters && (
            <tr className="admin-filter-row">
              {columns.map((column) => (
                <td key={column.key}>
                  {column.filterable === true && (
                    <FilterInput
                      column={column}
                      value={filters[column.key] ?? ''}
                      onCommit={(value) =>
                        emit({ page: 1, filters: { ...filters, [column.key]: value } })
                      }
                    />
                  )}
                </td>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              tabIndex={index === Math.min(focusIndex, rows.length - 1) ? 0 : -1}
              className={interactive ? 'admin-row admin-row-interactive' : 'admin-row'}
              onKeyDown={(event) => onRowKeyDown(event, index)}
              onFocus={() => setFocusIndex(index)}
              onClick={interactive ? () => onRowActivate(row) : undefined}
              data-testid={rowTestId}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === 'end' ? 'admin-align-end' : undefined}
                >
                  {cellValue(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <EmptyState
          title={emptyTitle}
          {...(emptyDescription === undefined ? {} : { description: emptyDescription })}
        />
      )}
      {pagination !== undefined && rows.length > 0 && (
        <Pager pagination={pagination} onPage={(page) => emit({ page })} />
      )}
    </div>
  );
}

interface HeaderRowProps<Row> {
  readonly columns: readonly Column<Row>[];
  readonly sort: SortState | null;
  readonly onSort: (key: string) => void;
}

function HeaderRow<Row>({ columns, sort, onSort }: HeaderRowProps<Row>) {
  return (
    <tr>
      {columns.map((column) => (
        <th
          key={column.key}
          scope="col"
          aria-sort={column.sortable ? ariaSort(sort, column.key) : undefined}
          className={column.align === 'end' ? 'admin-align-end' : undefined}
        >
          {column.sortable ? (
            <button
              type="button"
              className="admin-sort-button"
              onClick={() => onSort(column.key)}
              data-testid={`sort-${column.key}`}
            >
              {column.header}
              <span aria-hidden="true" className="admin-sort-indicator">
                {sort?.key === column.key ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}
              </span>
            </button>
          ) : (
            column.header
          )}
        </th>
      ))}
    </tr>
  );
}

interface FilterInputProps<Row> {
  readonly column: Column<Row>;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

/** Commits on Enter or blur; a value equal to the last commit (or the prop) is not re-emitted. */
function FilterInput<Row>({ column, value, onCommit }: FilterInputProps<Row>) {
  const [synced, setSynced] = useState(value);
  const [draft, setDraft] = useState(value);
  const [emitted, setEmitted] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
    setEmitted(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === emitted) return;
    setEmitted(next);
    onCommit(next);
  };
  return (
    <input
      type="search"
      className="admin-input admin-input-small"
      aria-label={`Filter ${column.header}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      data-testid={`filter-${column.key}`}
    />
  );
}

interface PagerProps {
  readonly pagination: PaginationState;
  readonly onPage: (page: number) => void;
}

function Pager({ pagination, onPage }: PagerProps) {
  const pages = pageCount(pagination);
  const first = (pagination.page - 1) * pagination.limit + 1;
  const last = Math.min(pagination.total, pagination.page * pagination.limit);
  return (
    <nav className="admin-pager" aria-label="Pagination">
      <p className="admin-muted admin-tabular" aria-live="polite">
        {first}–{last} of {pagination.total} · page {pagination.page} of {pages}
      </p>
      <div className="admin-pager-buttons">
        <button
          type="button"
          className="admin-btn admin-btn-small"
          onClick={() => onPage(pagination.page - 1)}
          disabled={pagination.page <= 1}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        <button
          type="button"
          className="admin-btn admin-btn-small"
          onClick={() => onPage(pagination.page + 1)}
          disabled={pagination.page >= pages}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>
    </nav>
  );
}
