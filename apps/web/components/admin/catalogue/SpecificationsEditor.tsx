'use client';

import { useState } from 'react';

interface SpecRow {
  readonly id: number;
  readonly key: string;
  readonly value: string;
}

interface SpecificationsEditorProps {
  readonly id: string;
  readonly value: Readonly<Record<string, string>>;
  readonly onChange: (next: Readonly<Record<string, string>>) => void;
  readonly disabled?: boolean;
}

const DUPLICATE_MESSAGE = (key: string) => `"${key}" is already used; keys must be unique`;

const toRows = (value: Readonly<Record<string, string>>): readonly SpecRow[] =>
  Object.entries(value).map(([key, entry], index) => ({ id: index + 1, key, value: entry }));

/** Indexes of rows whose trimmed key already appeared in an earlier row; the first keeps the key. */
export const duplicateRowIndexes = (
  rows: readonly { readonly key: string }[],
): ReadonlySet<number> => {
  const seen = new Set<string>();
  const duplicates = new Set<number>();
  rows.forEach((row, index) => {
    const key = row.key.trim();
    if (key === '') return;
    if (seen.has(key)) duplicates.add(index);
    seen.add(key);
  });
  return duplicates;
};

/** Rows → record in row order; blank rows are dropped, partial rows are kept so Zod can flag them. */
export const rowsToRecord = (rows: readonly SpecRow[]): Readonly<Record<string, string>> =>
  Object.fromEntries(
    rows
      .filter((row) => row.key.trim() !== '' || row.value.trim() !== '')
      .map((row) => [row.key.trim(), row.value.trim()]),
  );

const swap = (rows: readonly SpecRow[], from: number, to: number): readonly SpecRow[] => {
  if (to < 0 || to >= rows.length) return rows;
  const next = [...rows];
  const a = next[from];
  const b = next[to];
  if (a === undefined || b === undefined) return rows;
  next[from] = b;
  next[to] = a;
  return next;
};

/** Ordered key/value pairs; emits only when no key is duplicated. */
export function SpecificationsEditor({
  id,
  value,
  onChange,
  disabled = false,
}: SpecificationsEditorProps) {
  const [rows, setRows] = useState<readonly SpecRow[]>(() => toRows(value));
  const [sequence, setSequence] = useState(rows.length);
  const duplicates = duplicateRowIndexes(rows);

  const commit = (next: readonly SpecRow[]) => {
    setRows(next);
    if (duplicateRowIndexes(next).size === 0) onChange(rowsToRecord(next));
  };

  const update = (rowId: number, patch: Partial<Pick<SpecRow, 'key' | 'value'>>) =>
    commit(rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));

  const add = () => {
    const nextId = sequence + 1;
    setSequence(nextId);
    commit([...rows, { id: nextId, key: '', value: '' }]);
  };

  return (
    <div id={id} data-testid="specs-editor">
      <ol className="admin-spec-rows">
        {rows.map((row, index) => {
          const key = row.key.trim();
          const duplicate = duplicates.has(index);
          const errorId = `${id}-${row.id}-error`;
          const name = key === '' ? `row ${index + 1}` : key;
          return (
            <li key={row.id} className="admin-spec-row" data-testid="spec-row">
              <input
                type="text"
                className="admin-input admin-input-small"
                aria-label={`Specification ${index + 1} name`}
                aria-invalid={duplicate ? true : undefined}
                aria-describedby={duplicate ? errorId : undefined}
                value={row.key}
                disabled={disabled}
                onChange={(event) => update(row.id, { key: event.target.value })}
              />
              <input
                type="text"
                className="admin-input admin-input-small"
                aria-label={`Specification ${index + 1} value`}
                value={row.value}
                disabled={disabled}
                onChange={(event) => update(row.id, { value: event.target.value })}
              />
              <span className="admin-icon-group">
                <button
                  type="button"
                  className="admin-btn admin-btn-small admin-btn-icon"
                  aria-label={`Move ${name} up`}
                  disabled={disabled || index === 0}
                  onClick={() => commit(swap(rows, index, index - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-small admin-btn-icon"
                  aria-label={`Move ${name} down`}
                  disabled={disabled || index === rows.length - 1}
                  onClick={() => commit(swap(rows, index, index + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-small admin-btn-icon admin-btn-danger"
                  aria-label={`Remove ${name}`}
                  disabled={disabled}
                  onClick={() => commit(rows.filter((entry) => entry.id !== row.id))}
                >
                  ×
                </button>
              </span>
              {duplicate && (
                <p id={errorId} className="admin-error" role="alert">
                  {DUPLICATE_MESSAGE(key)}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="admin-btn admin-btn-small"
        onClick={add}
        disabled={disabled}
        style={{ marginTop: '0.5rem' }}
        data-testid="spec-add"
      >
        Add specification
      </button>
    </div>
  );
}
