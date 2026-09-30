// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, routerMock, stubFetch } from '@/test-utils/admin';
import { categoryTree, movementRow, stockRow } from '@/test-utils/catalogue';

import type { AdminRole } from '../Nav.config';
import { ToastProvider } from '../Toast';

import { adjustmentState } from './adjust';
import { AdjustDialog } from './AdjustDialog';
import { LedgerTable } from './LedgerTable';
import { LowStockList } from './LowStockList';
import { StockTable } from './StockTable';

vi.mock('next/navigation', async () => {
  const { routerMock: router } = await import('@/test-utils/admin');
  return { useRouter: () => router, usePathname: () => '/admin/inventory' };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('adjustmentState', () => {
  it('flags step-up strictly above 100 units and blocks STAFF there', () => {
    expect(adjustmentState('100', 'restock', 10, 'STAFF')).toMatchObject({
      needsStepUp: false,
      blockedForStaff: false,
      canSubmit: true,
      previewStock: 110,
    });
    expect(adjustmentState('-100', 'restock', 100, 'STAFF')).toMatchObject({
      needsStepUp: false,
      canSubmit: true,
      previewStock: 0,
    });
    expect(adjustmentState('101', 'restock', 10, 'STAFF')).toMatchObject({
      needsStepUp: true,
      blockedForStaff: true,
      canSubmit: false,
    });
    expect(adjustmentState('101', 'restock', 10, 'ADMIN')).toMatchObject({
      needsStepUp: true,
      blockedForStaff: false,
      canSubmit: true,
    });
    expect(adjustmentState('-11', 'damaged', 10, 'ADMIN')).toMatchObject({
      wouldGoNegative: true,
      canSubmit: false,
    });
    expect(adjustmentState('0', 'nothing', 10, 'ADMIN')).toMatchObject({
      delta: null,
      canSubmit: false,
    });
    expect(adjustmentState('2.5', 'nothing', 10, 'ADMIN').delta).toBeNull();
    expect(adjustmentState('5', 'abc', 10, 'ADMIN')).toMatchObject({
      noteTooShort: true,
      canSubmit: false,
    });
  });
});

const renderDialog = (role: AdminRole) => {
  const onAdjusted = vi.fn();
  render(
    <ToastProvider>
      <AdjustDialog row={stockRow} role={role} onClose={vi.fn()} onAdjusted={onAdjusted} />
    </ToastProvider>,
  );
  return onAdjusted;
};

describe('AdjustDialog', () => {
  it('previews the new stock, shows the step-up hint at 101 and posts delta + note', async () => {
    const calls = stubFetch(() => okEnvelope({ stock: 111, movementId: 'm1' }));
    const user = userEvent.setup();
    const onAdjusted = renderDialog('ADMIN');

    await user.type(screen.getByTestId('adjust-delta'), '100');
    expect(screen.getByTestId('adjust-preview')).toHaveTextContent('10 → 110');
    expect(screen.queryByTestId('adjust-stepup-hint')).toBeNull();
    await user.type(screen.getByTestId('adjust-delta'), '{backspace}{backspace}{backspace}101');
    expect(screen.getByTestId('adjust-stepup-hint')).toHaveTextContent('require an admin step-up');
    await user.type(screen.getByTestId('adjust-note'), 'New delivery received');
    await user.click(screen.getByTestId('adjust-submit'));

    await waitFor(() =>
      expect(onAdjusted).toHaveBeenCalledWith(stockRow, { stock: 111, movementId: 'm1' }),
    );
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: `/api/v1/admin/inventory/${stockRow.variantId}/adjust`,
      body: { delta: 101, note: 'New delivery received' },
    });
  });

  it('keeps STAFF below 100 units and shows the API message on 409', async () => {
    stubFetch(() => errorEnvelope(409, 'INSUFFICIENT_STOCK', 'Insufficient stock'));
    const user = userEvent.setup();
    renderDialog('STAFF');

    await user.type(screen.getByTestId('adjust-delta'), '150');
    await user.type(screen.getByTestId('adjust-note'), 'big restock');
    expect(screen.getByTestId('adjust-stepup-hint')).toHaveTextContent(
      'Staff can adjust up to 100 units',
    );
    expect(screen.getByTestId('adjust-submit')).toBeDisabled();
    await user.clear(screen.getByTestId('adjust-delta'));
    await user.type(screen.getByTestId('adjust-delta'), '-5');
    expect(screen.getByTestId('adjust-submit')).toBeEnabled();
    await user.click(screen.getByTestId('adjust-submit'));

    expect(await screen.findByTestId('adjust-error')).toHaveTextContent('Insufficient stock');
  });
});

describe('StockTable, LedgerTable and LowStockList', () => {
  it('renders low badges, opens the adjust dialog and pushes URL filters', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <StockTable
          rows={[
            stockRow,
            { ...stockRow, variantId: 'v2', sku: 'ROSE-100', stock: 0, isLow: true },
          ]}
          pagination={{ page: 1, limit: 20, total: 2 }}
          filters={{}}
          categories={categoryTree}
          role="ADMIN"
        />
      </ToastProvider>,
    );

    expect(screen.getAllByTestId('stock-row')).toHaveLength(2);
    expect(screen.getByTestId('low-badge')).toHaveTextContent('Out');
    await user.click(screen.getByTestId('adjust-ROSE-50'));
    expect(screen.getByTestId('adjust-dialog')).toBeInTheDocument();
    await user.type(screen.getByTestId('stock-filter-q'), 'rose');
    await user.click(screen.getByTestId('stock-filter-below'));
    await user.click(screen.getByTestId('stock-apply'));
    expect(routerMock.push).toHaveBeenCalledWith(
      '/admin/inventory?q=rose&belowThreshold=true&page=1',
    );
  });

  it('lists movements with signed deltas and filters in the URL', async () => {
    const user = userEvent.setup();
    render(
      <LedgerTable
        rows={[
          movementRow,
          { ...movementRow, id: 'm2', delta: 20, reason: 'IMPORT', actor: null, note: null },
        ]}
        pagination={{ page: 1, limit: 20, total: 2 }}
        filters={{}}
      />,
    );

    expect(screen.getAllByTestId('ledger-delta').map((el) => el.textContent)).toEqual([
      '−5',
      '+20',
    ]);
    expect(screen.getByText('system')).toBeInTheDocument();
    await user.selectOptions(screen.getByTestId('ledger-filter-reason'), 'ADJUSTMENT');
    await user.click(screen.getByTestId('ledger-apply'));
    expect(routerMock.push).toHaveBeenCalledWith(
      '/admin/inventory/movements?reason=ADJUSTMENT&page=1',
    );
  });

  it('shows the low-stock summary with a see-all link past the limit', () => {
    render(
      <LowStockList rows={[stockRow, { ...stockRow, variantId: 'v2', sku: 'B' }]} limit={1} />,
    );

    expect(screen.getByTestId('low-stock-list')).toHaveTextContent('Low stock (2)');
    expect(screen.getByRole('link', { name: 'See all 2' })).toHaveAttribute(
      'href',
      '/admin/inventory?belowThreshold=true',
    );
    render(<LowStockList rows={[]} />);
    expect(screen.getByText('Every variant is above its threshold.')).toBeInTheDocument();
  });
});
