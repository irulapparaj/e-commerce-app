// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type Column, DataTable, type TableQuery } from './DataTable';

interface Row {
  readonly id: string;
  readonly email: string;
  readonly count: number;
  readonly note: string | null;
}

const rows: readonly Row[] = [
  { id: '1', email: 'a@x.test', count: 3, note: null },
  { id: '2', email: 'b@x.test', count: 5, note: 'hello' },
  { id: '3', email: 'c@x.test', count: 1, note: 'x' },
];

const columns: readonly Column<Row>[] = [
  { key: 'email', header: 'Email', sortable: true, filterable: true },
  { key: 'count', header: 'Count', sortable: true, align: 'end' },
  { key: 'note', header: 'Note', render: (row) => <em>{row.note ?? 'none'}</em> },
];

const setup = (overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) => {
  const onChange = vi.fn<(query: TableQuery) => void>();
  const onRowActivate = vi.fn<(row: Row) => void>();
  render(
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      caption="People"
      pagination={{ page: 2, limit: 3, total: 8 }}
      sort={{ key: 'email', direction: 'asc' }}
      filters={{ email: 'x' }}
      onChange={onChange}
      onRowActivate={onRowActivate}
      {...overrides}
    />,
  );
  return { onChange, onRowActivate };
};

describe('DataTable', () => {
  it('renders semantic headers, custom cells and dashes for empty values', () => {
    setup();

    expect(screen.getByRole('table', { name: 'People' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByRole('columnheader', { name: /Email/ })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('columnheader', { name: /Email/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getAllByTestId('table-row')).toHaveLength(3);
    expect(screen.getAllByRole('emphasis')[0]).toHaveTextContent('none');
  });

  it('emits page changes with the current sort and filters, disabling the edges', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Previous page' }));

    expect(onChange.mock.calls).toEqual([
      [{ page: 3, sort: { key: 'email', direction: 'asc' }, filters: { email: 'x' } }],
      [{ page: 1, sort: { key: 'email', direction: 'asc' }, filters: { email: 'x' } }],
    ]);
    expect(screen.getByText(/4–6 of 8/)).toBeInTheDocument();
  });

  it('disables prev on the first page and next on the last', () => {
    setup({ pagination: { page: 1, limit: 10, total: 3 } });

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('toggles sort direction on the active column and resets to page 1', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.click(screen.getByTestId('sort-email'));
    await user.click(screen.getByTestId('sort-count'));

    expect(onChange.mock.calls).toEqual([
      [{ page: 1, sort: { key: 'email', direction: 'desc' }, filters: { email: 'x' } }],
      [{ page: 1, sort: { key: 'count', direction: 'asc' }, filters: { email: 'x' } }],
    ]);
  });

  it('commits column filters on Enter and blur, ignoring unchanged values', async () => {
    const user = userEvent.setup();
    const { onChange } = setup();
    const filter = screen.getByLabelText('Filter Email');

    await user.clear(filter);
    await user.type(filter, 'bob{Enter}');
    await user.tab();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      page: 1,
      sort: { key: 'email', direction: 'asc' },
      filters: { email: 'bob' },
    });
  });

  it('moves focus between rows with arrow keys and activates with Enter or click', async () => {
    const user = userEvent.setup();
    const { onRowActivate } = setup();
    const [first, second, third] = screen.getAllByTestId('table-row');

    first?.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(third).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(second).toHaveFocus();
    await user.keyboard('{Home}');
    expect(first).toHaveFocus();
    await user.keyboard('{End}');
    expect(third).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onRowActivate).toHaveBeenLastCalledWith(rows[2]);
    await user.click(within(second as HTMLElement).getByText('b@x.test'));
    expect(onRowActivate).toHaveBeenLastCalledWith(rows[1]);
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(second).toHaveAttribute('tabindex', '0');
  });

  it('shows the empty state and no pager when there are no rows', () => {
    setup({ rows: [], emptyTitle: 'No people', emptyDescription: 'Invite someone' });

    expect(screen.getByRole('status')).toHaveTextContent('No people');
    expect(screen.getByRole('status')).toHaveTextContent('Invite someone');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });

  it('works without pagination, sort, filters or handlers', () => {
    render(
      <DataTable
        columns={[{ key: 'email', header: 'Email' }]}
        rows={rows}
        rowKey={(row) => row.id}
        caption="Plain"
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Email' })).not.toHaveAttribute('aria-sort');
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getAllByTestId('table-row')[0]).not.toHaveClass('admin-row-interactive');
  });
});
