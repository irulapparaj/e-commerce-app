// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { CUSTOMER_ID, customerDetail, customerRow, customerSession } from '@/test-utils/customers';

import { ToastProvider } from '../Toast';

import { AdminAddressList } from './AdminAddressList';
import { CustomerDetail } from './CustomerDetail';
import { STAFF_HINT } from './CustomerHeader';
import { CustomerTable, SEARCH_HINT } from './CustomerTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/customers' };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CustomerTable', () => {
  const rows = [
    customerRow,
    {
      ...customerRow,
      id: 'c2',
      maskedEmail: 'p•••@example.test',
      maskedPhone: null,
      isDisabled: true,
    },
    {
      ...customerRow,
      id: 'c3',
      maskedEmail: 'd•••@anon.invalid',
      maskedName: 'D. user',
      deleted: true,
    },
  ];

  it('renders masked contact details with status chips and the search hint', async () => {
    const user = userEvent.setup();
    render(
      <CustomerTable rows={rows} pagination={{ page: 1, limit: 20, total: 3 }} filters={{}} />,
    );
    const [first, second, third] = screen.getAllByTestId('customer-row');

    expect(within(first!).getByTestId('customer-masked-email')).toHaveTextContent(
      'i•••@example.test',
    );
    expect(within(first!).getByTestId('customer-masked-phone')).toHaveTextContent('98•••••210');
    expect(within(first!).getByTestId('customer-status')).toHaveTextContent('Active');
    expect(within(second!).getByTestId('customer-masked-phone')).toHaveTextContent('—');
    expect(within(second!).getByTestId('customer-status')).toHaveTextContent('Disabled');
    expect(third).toHaveTextContent('Deleted user');
    expect(within(third!).getByTestId('customer-status')).toHaveTextContent('Deleted');
    expect(screen.getByText(SEARCH_HINT)).toBeInTheDocument();

    await user.click(first!);
    expect(routerMock.push).toHaveBeenCalledWith(`/admin/customers/${CUSTOMER_ID}`);
  });

  it('puts the search term and page into the URL and clears it', async () => {
    const user = userEvent.setup();
    render(
      <CustomerTable
        rows={rows}
        pagination={{ page: 1, limit: 2, total: 3 }}
        filters={{ q: 'old' }}
      />,
    );
    const input = screen.getByTestId('customer-search');
    expect(input).toHaveValue('old');

    await user.clear(input);
    await user.type(input, ' priya@ ');
    await user.click(screen.getByTestId('customer-search-submit'));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/customers?q=priya%40&page=1');

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/customers?q=old&page=2');

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin/customers');
    expect(input).toHaveValue('');
  });
});

describe('AddressList', () => {
  it('shows masked lines, clear city/state/pincode and the default badge, or an empty state', () => {
    const { unmount } = render(<AdminAddressList addresses={customerDetail.addresses} />);
    const row = screen.getByTestId('address-row');
    expect(row).toHaveTextContent('I. Rajan');
    expect(row).toHaveTextContent('•••• Street');
    expect(row).toHaveTextContent('Chennai, Tamil Nadu 600001');
    expect(row).toHaveTextContent('98•••••210');
    expect(within(row).getByTestId('address-default')).toBeInTheDocument();
    unmount();

    render(<AdminAddressList addresses={[]} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('No saved addresses');
  });
});

describe('CustomerDetail', () => {
  const renderDetail = (role: 'ADMIN' | 'STAFF', customer = customerDetail) =>
    render(
      <ToastProvider>
        <CustomerDetail customer={customer} sessions={[customerSession]} role={role} />
      </ToastProvider>,
    );

  it('shows the masked header with actions for ADMIN and opens the reveal and disable dialogs', async () => {
    const user = userEvent.setup();
    renderDetail('ADMIN');

    expect(screen.getByTestId('customer-name')).toHaveTextContent('I. Rajan');
    expect(screen.getByTestId('customer-masked-email')).toHaveTextContent('i•••@example.test');
    expect(screen.getByTestId('customer-masked-phone')).toHaveTextContent('98•••••210');
    expect(screen.getByTestId('customer-status')).toHaveTextContent('Active');
    expect(screen.getByText('Orders arrive with P12')).toBeInTheDocument();
    expect(screen.getByTestId('session-row')).toBeInTheDocument();

    await user.click(screen.getByTestId('customer-reveal-open'));
    expect(screen.getByTestId('reveal-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('reveal-reason')).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('reveal-dialog')).toBeNull();

    await user.click(screen.getByTestId('customer-disable-open'));
    expect(screen.getByTestId('disable-dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('disable-dialog')).toBeNull();
  });

  it('enables a disabled account and reflects the returned customer', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope({ customer: customerDetail }));
    renderDetail('ADMIN', { ...customerDetail, isDisabled: true });

    expect(screen.getByTestId('customer-status')).toHaveTextContent('Disabled');
    await user.click(screen.getByTestId('customer-enable'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Account enabled');
    expect(screen.getByTestId('customer-status')).toHaveTextContent('Active');
    expect(calls).toEqual([
      { url: `/api/v1/admin/customers/${CUSTOMER_ID}/enable`, method: 'POST', body: undefined },
    ]);
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });

  it('toasts enable failures and hides every action from STAFF', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(404, 'NOT_FOUND', 'Customer not found'));
    const { unmount } = renderDetail('ADMIN', { ...customerDetail, isDisabled: true });
    await user.click(screen.getByTestId('customer-enable'));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Customer not found');
    unmount();

    renderDetail('STAFF');
    expect(screen.queryByTestId('customer-reveal-open')).toBeNull();
    expect(screen.queryByTestId('customer-disable-open')).toBeNull();
    expect(screen.getByTestId('customer-staff-hint')).toHaveTextContent(STAFF_HINT);
    expect(screen.getByTestId('dpdp-staff-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('session-revoke')).toBeNull();
  });

  it('shows an erased customer as "Deleted user" with actions disabled', () => {
    renderDetail('ADMIN', {
      ...customerDetail,
      deleted: true,
      maskedName: 'D. user',
      flags: { deleted: true, activeOrders: 0 },
    });

    expect(screen.getByTestId('customer-name')).toHaveTextContent('Deleted user');
    expect(screen.getByTestId('customer-status')).toHaveTextContent('Deleted');
    expect(screen.getByTestId('customer-reveal-open')).toBeDisabled();
    expect(screen.getByTestId('customer-disable-open')).toBeDisabled();
    expect(screen.getByTestId('customer-erase-open')).toBeDisabled();
  });

  it('marks the customer deleted locally after an erase', async () => {
    const user = userEvent.setup();
    stubFetch(() => okEnvelope({ erasedAt: '2026-09-26T05:00:00.000Z', retained: { orders: 2 } }));
    renderDetail('ADMIN');

    await user.click(screen.getByTestId('customer-erase-open'));
    await user.type(screen.getByTestId('erase-reason'), 'DPDP request ref 9876');
    await user.click(screen.getByTestId('erase-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('customer-name')).toHaveTextContent('Deleted user'),
    );
    expect(screen.getByTestId('customer-status')).toHaveTextContent('Deleted');
    expect(screen.queryByTestId('address-row')).toBeNull();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});
