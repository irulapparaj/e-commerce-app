// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StaffRow } from '@/lib/admin/types';
import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';

import { ToastProvider } from '../Toast';

import { StaffPanel } from './StaffPanel';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/staff' };
});

const rows: readonly StaffRow[] = [
  {
    id: 'u1',
    email: 'owner@example.test',
    name: 'Owner',
    role: 'ADMIN',
    mfaEnabled: true,
    isDisabled: false,
    lastLoginAt: '2026-09-26T04:00:00.000Z',
    sessionCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'u2',
    email: 'staff@example.test',
    name: null,
    role: 'STAFF',
    mfaEnabled: false,
    isDisabled: false,
    lastLoginAt: null,
    sessionCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

const renderPanel = () =>
  render(
    <ToastProvider>
      <StaffPanel rows={rows} />
    </ToastProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('StaffPanel', () => {
  it('lists staff with MFA status, sessions and per-row actions', () => {
    renderPanel();
    const [first, second] = screen.getAllByTestId('staff-row');

    expect(first).toHaveTextContent('owner@example.test');
    expect(first).toHaveTextContent('Enrolled');
    expect(second).toHaveTextContent('Pending');
    expect(second).toHaveTextContent('—');
    expect(
      within(second as HTMLElement).getByRole('button', {
        name: 'Revoke sessions for staff@example.test',
      }),
    ).toBeDisabled();
  });

  it('invites a team member through the dialog and refreshes the list', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() =>
      okEnvelope({ user: { ...rows[1], id: 'u3', email: 'new@example.test' } }),
    );
    renderPanel();

    await user.click(screen.getByTestId('invite-open'));
    const dialog = screen.getByRole('dialog', { name: 'Invite a team member' });
    expect(screen.getByTestId('invite-email')).toHaveFocus();
    await user.click(screen.getByTestId('invite-submit'));
    expect(await within(dialog).findAllByRole('alert')).not.toHaveLength(0);
    expect(calls).toHaveLength(0);

    await user.type(screen.getByTestId('invite-email'), 'New@Example.test');
    await user.type(screen.getByTestId('invite-name'), 'New Person');
    await user.selectOptions(screen.getByTestId('invite-role'), 'ADMIN');
    await user.click(screen.getByTestId('invite-submit'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Invite sent to new@example.test');
    expect(calls).toEqual([
      {
        url: '/api/v1/admin/staff',
        method: 'POST',
        body: { email: 'new@example.test', name: 'New Person', role: 'ADMIN' },
      },
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows invite failures inside the dialog', async () => {
    const user = userEvent.setup();
    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(409, 'CONFLICT', 'A user with this email already exists')
        : errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required'),
    );
    renderPanel();

    await user.click(screen.getByTestId('invite-open'));
    await user.type(screen.getByTestId('invite-email'), 'dup@example.test');
    await user.type(screen.getByTestId('invite-name'), 'Dup');
    await user.click(screen.getByTestId('invite-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');

    await user.click(screen.getByTestId('invite-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirmation was cancelled');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changes a role after confirmation and surfaces the last-admin 409 message', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((_call, index) =>
      index === 1
        ? okEnvelope({ user: { ...rows[1], role: 'ADMIN' } })
        : errorEnvelope(409, 'CONFLICT', 'Cannot demote the last ADMIN'),
    );
    renderPanel();

    await user.selectOptions(screen.getByLabelText('Role for staff@example.test'), 'ADMIN');
    const confirm = screen.getByTestId('staff-confirm');
    expect(confirm).toHaveTextContent('Change staff@example.test to ADMIN?');
    await user.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Role changed to ADMIN');
    expect(calls[0]).toEqual({
      url: '/api/v1/admin/staff/u2/role',
      method: 'POST',
      body: { role: 'ADMIN' },
    });
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);

    await user.selectOptions(screen.getByLabelText('Role for owner@example.test'), 'STAFF');
    expect(screen.getByTestId('confirm-accept')).toHaveClass('admin-btn-danger');
    await user.click(screen.getByTestId('confirm-accept'));

    const toasts = await screen.findAllByTestId('toast');
    expect(toasts.at(-1)).toHaveTextContent('Cannot demote the last ADMIN');
    expect(toasts.at(-1)).toHaveClass('admin-toast-critical');
    expect(screen.queryByTestId('staff-confirm')).toBeNull();
  });

  it('resets MFA and revokes sessions with body-less POSTs, and cancel does nothing', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ revoked: 2 }));
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Reset MFA for owner@example.test' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Reset MFA for owner@example.test' }));
    await user.click(screen.getByTestId('confirm-accept'));
    await screen.findByText('MFA reset; re-enrolment email sent');

    await user.click(
      screen.getByRole('button', { name: 'Revoke sessions for owner@example.test' }),
    );
    await user.click(screen.getByTestId('confirm-accept'));
    await screen.findByText('Sessions revoked');

    expect(calls.map((call) => [call.url, call.method, call.body])).toEqual([
      ['/api/v1/admin/staff/u1/mfa-reset', 'POST', undefined],
      ['/api/v1/admin/staff/u1/revoke-sessions', 'POST', undefined],
    ]);
  });

  it('reports non-API failures generically', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Reset MFA for owner@example.test' }));
    await user.click(screen.getByTestId('confirm-accept'));

    await waitFor(() =>
      expect(screen.getByTestId('toast')).toHaveTextContent('Something went wrong'),
    );
  });
});
