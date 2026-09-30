// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuditRow } from '@/lib/admin/types';
import { routerMock } from '@/test-utils/admin';

import { AuditDetail } from './AuditDetail';
import { AuditFilters } from './AuditFilters';
import { AuditTable } from './AuditTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/audit' };
});

const rows: readonly AuditRow[] = [
  {
    id: 'a1',
    actor: { id: 'u1', email: 'owner@example.test', role: 'ADMIN' },
    action: 'settings.updated',
    entityType: 'SiteSetting',
    entityId: 'free_shipping_threshold-0123456789',
    before: { value: 59900 },
    after: { value: 79900 },
    ip: '10.0.0.1',
    userAgent: 'Mozilla/5.0',
    createdAt: '2026-09-26T04:00:00.000Z',
  },
  {
    id: 'a2',
    actor: null,
    action: 'staff.created',
    entityType: 'User',
    entityId: null,
    before: null,
    after: null,
    ip: null,
    userAgent: null,
    createdAt: '2026-09-25T04:00:00.000Z',
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditFilters', () => {
  it('pushes the filters into the URL on apply and clears them', async () => {
    const user = userEvent.setup();
    render(<AuditFilters initial={{ action: 'settings.updated' }} />);

    expect(screen.getByLabelText('Action')).toHaveValue('settings.updated');
    await user.type(screen.getByLabelText('Actor ID'), 'u1');
    await user.type(screen.getByLabelText('From'), '2026-09-01');
    await user.click(screen.getByTestId('audit-apply'));

    expect(routerMock.push).toHaveBeenCalledWith(
      '/admin/audit?action=settings.updated&actorId=u1&from=2026-09-01&page=1',
    );

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('Action')).toHaveValue('');
    expect(routerMock.push).toHaveBeenLastCalledWith('/admin/audit');
  });
});

describe('AuditTable', () => {
  it('lists entries, pages through the URL and opens the before/after drawer on a row', async () => {
    const user = userEvent.setup();
    render(
      <AuditTable
        rows={rows}
        pagination={{ page: 1, limit: 20, total: 45 }}
        filters={{ action: 'settings.updated' }}
      />,
    );
    const [first, second] = screen.getAllByTestId('audit-row');

    expect(first).toHaveTextContent('owner@example.test');
    expect(first).toHaveTextContent('free_shipping…');
    expect(second).toHaveTextContent('system');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/audit?action=settings.updated&page=2');

    await user.click(within(first as HTMLElement).getByText('settings.updated'));
    const detail = screen.getByTestId('audit-detail');
    expect(detail).toHaveAttribute('aria-modal', 'true');
    expect(detail).toHaveTextContent('owner@example.test (ADMIN)');
    expect(detail).toHaveTextContent('SiteSetting · free_shipping_threshold-0123456789');
    const diff = within(screen.getByTestId('audit-diff')).getAllByRole('row');
    expect(diff[1]).toHaveAttribute('data-changed', 'true');
    expect(diff[1]).toHaveTextContent('59900');
    expect(diff[1]).toHaveTextContent('79900');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('audit-detail')).toBeNull();
  });

  it('explains when a row carries no payload', () => {
    render(<AuditDetail row={rows[1]!} onClose={() => undefined} />);

    expect(screen.getByTestId('audit-detail')).toHaveTextContent('No before/after payload');
    expect(screen.getByTestId('audit-detail')).toHaveTextContent('system');
  });

  it('renders nothing for no selection and the empty state for no rows', () => {
    render(<AuditDetail row={null} onClose={() => undefined} />);
    render(<AuditTable rows={[]} pagination={{ page: 1, limit: 20, total: 0 }} filters={{}} />);

    expect(screen.queryByTestId('audit-detail')).toBeNull();
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No audit entries match');
  });
});
