// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { IDS, product, variant } from '@/test-utils/catalogue';

import type { AdminRole } from '../Nav.config';
import { ToastProvider } from '../Toast';

import { buildVariantPatch, parseRupees, replaceVariant, toDraft } from './variant-form';
import { VariantsTable } from './VariantsTable';

const renderTable = (role: AdminRole) => {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <VariantsTable
        productId={IDS.product}
        variants={product.variants}
        role={role}
        onChanged={onChanged}
      />
    </ToastProvider>,
  );
  return onChanged;
};

const row = (sku: string): HTMLElement =>
  screen.getByLabelText(`SKU for ${sku}`).closest('tr') as HTMLElement;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('variant-form helpers', () => {
  it('parses rupees to paise and builds separate content and price patches', () => {
    expect(parseRupees('199')).toBe(19900);
    expect(parseRupees(' 12.5 ')).toBe(1250);
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('1.234')).toBeNull();

    const draft = { ...toDraft(variant), label: '50 g box', price: '209.00', compareAtPrice: '' };
    expect(buildVariantPatch(variant, draft, 'ADMIN')).toEqual({
      ok: true,
      content: { label: '50 g box' },
      price: { price: 20900, compareAtPrice: null },
    });
    expect(buildVariantPatch(variant, draft, 'STAFF')).toEqual({
      ok: true,
      content: { label: '50 g box' },
      price: null,
    });
    expect(buildVariantPatch(variant, toDraft(variant), 'ADMIN')).toEqual({
      ok: true,
      content: null,
      price: null,
    });
    expect(
      buildVariantPatch(variant, { ...toDraft(variant), weightGrams: '' }, 'STAFF'),
    ).toMatchObject({
      ok: false,
    });
    expect(buildVariantPatch(variant, { ...toDraft(variant), price: '' }, 'ADMIN')).toMatchObject({
      ok: false,
      message: expect.stringContaining('rupee'),
    });
    expect(
      buildVariantPatch(variant, { ...toDraft(variant), compareAtPrice: 'x' }, 'ADMIN'),
    ).toMatchObject({ ok: false });
    expect(
      buildVariantPatch(variant, { ...toDraft(variant), compareAtPrice: '100' }, 'ADMIN'),
    ).toMatchObject({ ok: false, message: expect.stringContaining('greater') });
  });

  it('replaces a variant and clears other defaults when the new one is default', () => {
    const next = replaceVariant(product.variants, { ...product.variants[1]!, isDefault: true });
    expect(next.map((entry) => entry.isDefault)).toEqual([false, true]);
  });
});

describe('VariantsTable', () => {
  it('disables price inputs for STAFF with an Admin-only hint and hides add/delete', () => {
    renderTable('STAFF');
    const first = row('ROSE-50');

    expect(within(first).getByLabelText('Price in rupees for ROSE-50')).toBeDisabled();
    expect(within(first).getByLabelText('Compare-at price in rupees for ROSE-50')).toBeDisabled();
    expect(within(first).getByLabelText('Price in rupees for ROSE-50')).toHaveAttribute(
      'title',
      'Admin only',
    );
    expect(within(first).getByLabelText('Label for ROSE-50')).toBeEnabled();
    expect(within(first).queryByRole('button', { name: 'Delete for ROSE-50' })).toBeNull();
    expect(screen.queryByTestId('variant-add')).toBeNull();
    expect(screen.getByText(/Adding variants: Admin only/)).toBeInTheDocument();
  });

  it('saves content and price as two requests for an ADMIN and reports the merged variant', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) =>
      okEnvelope({
        ...variant,
        label: '50 g box',
        ...(call.url.endsWith('/price') ? { price: 20900, compareAtPrice: null } : {}),
      }),
    );
    const onChanged = renderTable('ADMIN');
    const first = row('ROSE-50');
    const save = within(first).getByRole('button', { name: 'Save for ROSE-50' });

    expect(save).toBeDisabled();
    await user.type(within(first).getByLabelText('Label for ROSE-50'), ' box');
    const price = within(first).getByLabelText('Price in rupees for ROSE-50');
    await user.clear(price);
    await user.type(price, '209');
    await user.clear(within(first).getByLabelText('Compare-at price in rupees for ROSE-50'));
    await user.click(save);

    expect(await screen.findByTestId('toast')).toHaveTextContent('Saved ROSE-50');
    expect(calls).toEqual([
      {
        url: `/api/v1/admin/products/${IDS.product}/variants/${IDS.variant1}`,
        method: 'PATCH',
        body: { label: '50 g box' },
      },
      {
        url: `/api/v1/admin/products/${IDS.product}/variants/${IDS.variant1}/price`,
        method: 'PATCH',
        body: { price: 20900, compareAtPrice: null },
      },
    ]);
    expect(onChanged).toHaveBeenCalledWith([
      { ...variant, label: '50 g box', price: 20900, compareAtPrice: null },
      product.variants[1],
    ]);
  });

  it('rejects an invalid row locally and discards edits on request', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope(variant));
    renderTable('ADMIN');
    const first = row('ROSE-50');
    const weight = within(first).getByLabelText('Weight in grams for ROSE-50');

    await user.clear(weight);
    await user.click(within(first).getByRole('button', { name: 'Save for ROSE-50' }));
    expect(await screen.findByTestId('toast')).toHaveClass('admin-toast-critical');
    expect(calls).toHaveLength(0);

    await user.click(within(first).getByRole('button', { name: 'Discard changes for ROSE-50' }));
    expect(weight).toHaveValue(60);
  });

  it('creates a variant through the dialog (rupees converted to paise) and deletes with confirmation', async () => {
    const user = userEvent.setup();
    const created = {
      ...variant,
      id: '33333333-3333-4333-8333-333333333303',
      sku: 'ROSE-200',
      isDefault: false,
    };
    const calls = stubFetch((call) =>
      call.method === 'DELETE'
        ? errorEnvelope(409, 'CONFLICT', 'Variant is referenced by an order')
        : okEnvelope(created),
    );
    const onChanged = renderTable('ADMIN');

    await user.click(screen.getByTestId('variant-add'));
    expect(screen.getByTestId('variant-new-sku')).toHaveFocus();
    await user.click(screen.getByTestId('variant-new-submit'));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(calls).toHaveLength(0);

    await user.type(screen.getByTestId('variant-new-sku'), 'ROSE-200');
    await user.type(screen.getByTestId('variant-new-label'), '200 g');
    await user.type(screen.getByTestId('variant-new-weight'), '220');
    await user.type(screen.getByTestId('variant-new-price'), '499.5');
    await user.type(screen.getByTestId('variant-new-compare-at'), '100');
    await user.click(screen.getByTestId('variant-new-submit'));
    expect(await screen.findByText(/greater than the price/)).toBeInTheDocument();
    await user.clear(screen.getByTestId('variant-new-compare-at'));
    await user.click(screen.getByTestId('variant-new-submit'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Added ROSE-200');
    expect(calls[0]).toEqual({
      url: `/api/v1/admin/products/${IDS.product}/variants`,
      method: 'POST',
      body: {
        sku: 'ROSE-200',
        label: '200 g',
        weightGrams: 220,
        isDefault: false,
        lowStockThreshold: 5,
        price: 49950,
        compareAtPrice: null,
      },
    });
    expect(onChanged).toHaveBeenCalledWith([...product.variants, created]);
    expect(screen.queryByTestId('variant-dialog')).toBeNull();

    await user.click(within(row('ROSE-100')).getByRole('button', { name: 'Delete for ROSE-100' }));
    expect(screen.getByTestId('variant-delete-confirm')).toHaveTextContent(
      'Delete variant ROSE-100?',
    );
    await user.click(screen.getByTestId('confirm-accept'));
    await waitFor(() =>
      expect(screen.getAllByTestId('toast').at(-1)).toHaveTextContent(
        'Variant is referenced by an order',
      ),
    );
    expect(screen.queryByTestId('variant-delete-confirm')).toBeNull();
  });

  it('explains a cancelled step-up on the price request', async () => {
    const user = userEvent.setup();
    stubFetch(() => errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required'));
    const onChanged = renderTable('ADMIN');
    const first = row('ROSE-50');
    const price = within(first).getByLabelText('Price in rupees for ROSE-50');

    await user.clear(price);
    await user.type(price, '200');
    await user.click(within(first).getByRole('button', { name: 'Save for ROSE-50' }));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Confirmation was cancelled');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
