// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { exportStatus } from '@/test-utils/import';

import { ToastProvider } from '../Toast';

import { CANCELLED_MESSAGE, ExportPanel } from './ExportPanel';

const renderPanel = (role: 'ADMIN' | 'STAFF') =>
  render(
    <ToastProvider>
      <ExportPanel role={role} pollIntervalMs={1} />
    </ToastProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ExportPanel', () => {
  it('shows STAFF only the products card', () => {
    renderPanel('STAFF');

    expect(screen.getByTestId('export-products')).toBeInTheDocument();
    expect(screen.queryByTestId('export-orders')).toBeNull();
    expect(screen.queryByTestId('export-customers')).toBeNull();
    expect(screen.queryByTestId('export-full')).toBeNull();
  });

  it('queues a products export and polls until the download link appears', async () => {
    const user = userEvent.setup();
    let polls = 0;
    const calls = stubFetch((call) => {
      if (call.method === 'POST') return okEnvelope({ exportId: 'export-1' });
      polls += 1;
      return okEnvelope(
        polls < 2
          ? exportStatus()
          : exportStatus({ state: 'completed', url: 'https://bucket.test/products.csv?sig=1' }),
      );
    });
    renderPanel('STAFF');

    await user.click(screen.getByTestId('export-products'));

    expect(await screen.findByTestId('export-status')).toHaveTextContent('Generating…');
    expect(calls[0]).toEqual({
      url: '/api/v1/admin/export/products',
      method: 'POST',
      body: undefined,
    });
    const link = await screen.findByTestId('export-download');
    expect(link).toHaveAttribute('href', 'https://bucket.test/products.csv?sig=1');
    expect(link).toHaveTextContent('link valid 15 min');
    expect(screen.getByTestId('export-status')).toHaveTextContent('Ready to download');
    expect(screen.getByTestId('toast')).toHaveTextContent('Products export queued');
    const statusCalls = calls.filter((call) => call.url.endsWith('/export/export-1'));
    expect(statusCalls.length).toBeGreaterThanOrEqual(2);
    expect(statusCalls.every((call) => call.method === 'GET')).toBe(true);
  });

  it('requires a reason of ten characters for a full export and sends it with the request', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) =>
      call.method === 'POST'
        ? okEnvelope({ exportId: 'export-2' })
        : okEnvelope(
            exportStatus({ id: 'export-2', type: 'orders', state: 'failed', error: 'bucket down' }),
          ),
    );
    renderPanel('ADMIN');

    expect(screen.queryByTestId('export-reason')).toBeNull();
    await user.click(screen.getByTestId('export-full'));
    const reason = screen.getByTestId('export-reason');
    expect(screen.getByTestId('export-orders')).toBeDisabled();
    expect(screen.getByTestId('export-customers')).toBeDisabled();

    await user.type(reason, 'too short');
    expect(screen.getByRole('alert')).toHaveTextContent('slightly longer');
    expect(screen.getByTestId('export-orders')).toBeDisabled();

    await user.type(reason, ' — GST audit');
    await user.click(screen.getByTestId('export-orders'));

    expect(calls[0]).toEqual({
      url: '/api/v1/admin/export/orders',
      method: 'POST',
      body: { full: true, reason: 'too short — GST audit' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('export-status')).toHaveTextContent('Failed: bucket down'),
    );
    expect(screen.queryByTestId('export-download')).toBeNull();
  });

  it('sends an empty body for a minimised customers export and explains a cancelled step-up', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((_call, index) =>
      index === 1
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : okEnvelope({ exportId: 'export-3' }),
    );
    renderPanel('ADMIN');

    await user.click(screen.getByTestId('export-customers'));
    expect(await screen.findByTestId('export-error')).toHaveTextContent(CANCELLED_MESSAGE);
    expect(calls[0]?.body).toEqual({});

    stubFetch(() => okEnvelope({ exportId: 'export-3' }));
    await user.click(screen.getByTestId('export-customers'));
    expect(await screen.findByTestId('export-row')).toHaveTextContent('Customers');
    expect(screen.queryByTestId('export-error')).toBeNull();
  });
});
