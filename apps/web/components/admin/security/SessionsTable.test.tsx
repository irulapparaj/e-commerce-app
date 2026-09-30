// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminSessionRow } from '@/lib/admin/types';
import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';

import { ToastProvider } from '../Toast';

import { SessionsTable } from './SessionsTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/security' };
});

const rows: readonly AdminSessionRow[] = [
  {
    id: 's1',
    user: { id: 'u1', email: 'owner@example.test', role: 'ADMIN' },
    ip: '10.0.0.1',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128',
    lastUsedAt: '2026-09-26T04:00:00.000Z',
    createdAt: '2026-09-26T03:00:00.000Z',
    expiresAt: '2026-09-26T11:00:00.000Z',
  },
  {
    id: 's2',
    user: { id: 'u2', email: 'staff@example.test', role: 'STAFF' },
    ip: null,
    userAgent: null,
    lastUsedAt: '2026-09-26T04:00:00.000Z',
    createdAt: '2026-09-26T03:00:00.000Z',
    expiresAt: '2026-09-26T11:00:00.000Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('SessionsTable', () => {
  it('revokes a session after confirmation and refreshes', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ revoked: true }));
    render(
      <ToastProvider>
        <SessionsTable rows={rows} />
      </ToastProvider>,
    );

    expect(screen.getAllByTestId('session-row')[0]).toHaveTextContent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Ap…',
    );
    await user.click(screen.getByRole('button', { name: 'Revoke session for owner@example.test' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Revoke session for owner@example.test' }));
    await user.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Session for owner@example.test revoked',
    );
    expect(calls).toEqual([
      { url: '/api/v1/admin/security/sessions/s1/revoke', method: 'POST', body: undefined },
    ]);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('session-confirm')).toBeNull();
  });

  it('shows API failures as critical toasts', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'Session not found'));
    render(
      <ToastProvider>
        <SessionsTable rows={rows} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Revoke session for staff@example.test' }));
    await user.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Session not found');
    expect(screen.getByTestId('toast')).toHaveClass('admin-toast-critical');
  });
});
