// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { CUSTOMER_ID, customerDetail, customerSession, SESSION_ID } from '@/test-utils/customers';

import { ToastProvider } from '../Toast';

import { CANCELLED_MESSAGE as DISABLE_CANCELLED, DisableDialog } from './DisableDialog';
import {
  BLOCKED_MESSAGE,
  CANCELLED_MESSAGE as ERASE_CANCELLED,
  DpdpActions,
  EXPORT_QUEUED_MESSAGE,
} from './DpdpActions';
import { SessionsTable } from './SessionsTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/customers/x' };
});

const REASON = 'Abusive behaviour reported in ticket 1234';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('DisableDialog', () => {
  const setup = () => {
    const user = userEvent.setup();
    const onDisabled = vi.fn();
    render(
      <DisableDialog customer={customerDetail} open onClose={vi.fn()} onDisabled={onDisabled} />,
    );
    return { user, onDisabled };
  };

  it('needs a ten-character reason and posts it, handing back the updated customer', async () => {
    const disabled = { ...customerDetail, isDisabled: true };
    const calls = stubFetch(() => okEnvelope({ customer: disabled }));
    const { user, onDisabled } = setup();

    expect(screen.getByTestId('disable-submit')).toBeDisabled();
    await user.type(screen.getByTestId('disable-reason'), 'short');
    expect(screen.getByTestId('disable-submit')).toBeDisabled();
    await user.clear(screen.getByTestId('disable-reason'));
    await user.type(screen.getByTestId('disable-reason'), `  ${REASON}  `);
    await user.click(screen.getByTestId('disable-submit'));

    await waitFor(() => expect(onDisabled).toHaveBeenCalledWith(disabled));
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/customers/${CUSTOMER_ID}/disable`,
        method: 'POST',
        body: { reason: REASON },
      },
    ]);
  });

  it('explains a cancelled step-up and shows other failures', async () => {
    stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : errorEnvelope(404, 'NOT_FOUND', 'Customer not found'),
    );
    const { user, onDisabled } = setup();

    await user.type(screen.getByTestId('disable-reason'), REASON);
    await user.click(screen.getByTestId('disable-submit'));
    expect(await screen.findByTestId('disable-error')).toHaveTextContent(DISABLE_CANCELLED);
    await user.click(screen.getByTestId('disable-submit'));
    expect(await screen.findByTestId('disable-error')).toHaveTextContent('Customer not found');
    expect(onDisabled).not.toHaveBeenCalled();
  });
});

describe('DpdpActions', () => {
  const renderActions = (customer = customerDetail, role: 'ADMIN' | 'STAFF' = 'ADMIN') => {
    const onErased = vi.fn();
    render(
      <ToastProvider>
        <DpdpActions customer={customer} role={role} onErased={onErased} />
      </ToastProvider>,
    );
    return onErased;
  };

  it('queues the data export and tells the admin the customer gets an email', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ jobId: 'dpdp-job-1' }));
    renderActions();

    await user.click(screen.getByTestId('customer-export'));

    expect(await screen.findByTestId('toast')).toHaveTextContent(EXPORT_QUEUED_MESSAGE);
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/customers/${CUSTOMER_ID}/dpdp-export`,
        method: 'POST',
        body: undefined,
      },
    ]);
  });

  it('disables erase with an explanation while orders are active', () => {
    renderActions({ ...customerDetail, flags: { deleted: false, activeOrders: 2 } });

    expect(screen.getByTestId('customer-erase-open')).toBeDisabled();
    expect(screen.getByTestId('erase-blocked')).toHaveTextContent('2 active orders');
    expect(screen.getByTestId('erase-blocked')).toHaveTextContent(BLOCKED_MESSAGE);
  });

  it('erases with a reason behind the dialog and surfaces the active-orders 409', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(409, 'ERASE_BLOCKED_ACTIVE_ORDERS', 'Customer has active orders', {
            activeOrders: 1,
          })
        : index === 2
          ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
          : okEnvelope({ erasedAt: '2026-09-26T05:00:00.000Z', retained: { orders: 1 } }),
    );
    const onErased = renderActions();

    await user.click(screen.getByTestId('customer-erase-open'));
    expect(screen.getByTestId('erase-submit')).toBeDisabled();
    await user.type(screen.getByTestId('erase-reason'), 'DPDP erasure request ref 9876');
    await user.click(screen.getByTestId('erase-submit'));
    expect(await screen.findByTestId('erase-error')).toHaveTextContent(BLOCKED_MESSAGE);

    await user.click(screen.getByTestId('erase-submit'));
    expect(await screen.findByTestId('erase-error')).toHaveTextContent(ERASE_CANCELLED);

    await user.click(screen.getByTestId('erase-submit'));
    await waitFor(() =>
      expect(onErased).toHaveBeenCalledWith({
        erasedAt: '2026-09-26T05:00:00.000Z',
        retained: { orders: 1 },
      }),
    );
    expect(screen.queryByTestId('erase-dialog')).toBeNull();
    expect(screen.getByTestId('toast')).toHaveTextContent('1 order record retained');
    expect(calls[2]).toEqual({
      url: `/api/v1/admin/customers/${CUSTOMER_ID}/dpdp-erase`,
      method: 'POST',
      body: { reason: 'DPDP erasure request ref 9876' },
    });
  });

  it('toasts export failures and shows STAFF a hint instead of actions', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(503, 'SERVICE_UNAVAILABLE', 'Queue unavailable'));
    const { unmount } = render(
      <ToastProvider>
        <DpdpActions customer={customerDetail} role="ADMIN" onErased={vi.fn()} />
      </ToastProvider>,
    );
    await user.click(screen.getByTestId('customer-export'));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Queue unavailable');
    unmount();

    renderActions(customerDetail, 'STAFF');
    expect(screen.getByTestId('dpdp-staff-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('customer-export')).toBeNull();
  });
});

describe('SessionsTable', () => {
  const renderTable = (role: 'ADMIN' | 'STAFF' = 'ADMIN') =>
    render(
      <ToastProvider>
        <SessionsTable customerId={CUSTOMER_ID} rows={[customerSession]} role={role} />
      </ToastProvider>,
    );

  it('revokes a session after confirmation and drops the row', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ revoked: true }));
    renderTable();

    expect(screen.getByTestId('session-row')).toHaveTextContent('STOREFRONT');
    expect(screen.getByTestId('session-row')).toHaveTextContent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Ma…',
    );
    await user.click(screen.getByTestId('session-revoke'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(calls).toHaveLength(0);

    await user.click(screen.getByTestId('session-revoke'));
    await user.click(screen.getByTestId('confirm-accept'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Session revoked');
    expect(screen.queryByTestId('session-row')).toBeNull();
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No active sessions');
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/customers/${CUSTOMER_ID}/sessions/${SESSION_ID}/revoke`,
        method: 'POST',
        body: undefined,
      },
    ]);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps the row and toasts on failure, and offers STAFF no revoke', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required'));
    const { unmount } = renderTable();
    await user.click(screen.getByTestId('session-revoke'));
    await user.click(screen.getByTestId('confirm-accept'));
    expect(await screen.findByTestId('toast')).toHaveClass('admin-toast-critical');
    expect(screen.getByTestId('session-row')).toBeInTheDocument();
    unmount();

    renderTable('STAFF');
    expect(screen.queryByTestId('session-revoke')).toBeNull();
    expect(screen.getByTestId('session-row')).toBeInTheDocument();
  });
});
