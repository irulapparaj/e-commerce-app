// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AdminProductDetail } from '@/lib/admin/catalogue-types';
import { errorEnvelope, okEnvelope, stubFetch } from '@/test-utils/admin';
import { categoryTree, IDS, product } from '@/test-utils/catalogue';

import type { AdminRole } from '../Nav.config';
import { ToastProvider } from '../Toast';

import { categoryOptions, changedCommercial, fieldError, toFormValues } from './product-form';
import { ProductForm } from './ProductForm';
import { UNSAVED_MESSAGE } from './useUnsavedChanges';

beforeAll(() => {
  const emptyRect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  Range.prototype.getBoundingClientRect = () => ({ ...emptyRect, toJSON: () => emptyRect });
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
});

const renderForm = (role: AdminRole = 'ADMIN', current: AdminProductDetail | null = product) => {
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <h1 id="page-title">Product</h1>
      <a href="/admin/products" data-testid="away">
        Back
      </a>
      <ProductForm product={current} categories={categoryTree} role={role} onSaved={onSaved} />
    </ToastProvider>,
  );
  return onSaved;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('product-form helpers', () => {
  it('maps a product to form values, treating `{}` descriptions as empty documents', () => {
    const values = toFormValues({ ...product, description: {} as never });
    expect(values.description).toEqual({ type: 'doc', content: [] });
    expect(values.commercial).toEqual({
      hsnCode: '3307',
      gstRate: 5,
      isFeatured: false,
      metaTitle: null,
      metaDescription: null,
    });
    expect(toFormValues(null).commercial).toBeUndefined();
  });

  it('diffs commercial values and flattens the category tree', () => {
    const before = toFormValues(product).commercial;
    expect(changedCommercial(before, { ...before!, gstRate: 12, metaTitle: 'x' })).toEqual({
      gstRate: 12,
      metaTitle: 'x',
    });
    expect(changedCommercial(before, before)).toEqual({});
    expect(changedCommercial(before, undefined)).toEqual({});
    expect(categoryOptions(categoryTree).map((option) => option.label)).toEqual([
      'Agarbatti',
      'Agarbatti › Premium',
      'Agarbatti › Flora',
      'Dhoop',
    ]);
    expect(
      fieldError({ commercial: { hsnCode: { type: 'x', message: 'bad' } } }, 'commercial.hsnCode'),
    ).toBe('bad');
    expect(fieldError({}, 'commercial.hsnCode')).toBeNull();
  });
});

describe('ProductForm', () => {
  it('saves content then only the changed commercial fields for an ADMIN', async () => {
    const user = userEvent.setup();
    const calls = stubFetch((call) =>
      okEnvelope({
        ...product,
        name: 'Rose Agarbatti Deluxe',
        ...(call.url.endsWith('/commercial') ? { hsnCode: '33074100' } : {}),
      }),
    );
    const onSaved = renderForm();
    await screen.findByRole('textbox', { name: 'Description' });

    expect(screen.getByTestId('product-form-status')).toHaveTextContent('');
    await user.type(screen.getByTestId('product-name'), ' Deluxe');
    expect(screen.getByTestId('product-form-status')).toHaveTextContent('Unsaved changes');
    await user.clear(screen.getByTestId('product-hsn'));
    await user.type(screen.getByTestId('product-hsn'), '33074100');
    await user.click(screen.getByTestId('product-save'));

    expect(await screen.findByTestId('toast')).toHaveTextContent('Saved');
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['PATCH', `/api/v1/admin/products/${IDS.product}/content`],
      ['PATCH', `/api/v1/admin/products/${IDS.product}/commercial`],
    ]);
    expect(calls[0]?.body).toEqual({
      name: 'Rose Agarbatti Deluxe',
      sku: 'ROSE',
      categoryId: IDS.premium,
      description: product.description,
      specifications: { Weight: '50 g' },
      howToUse: 'Light and enjoy.',
      tags: ['rose'],
    });
    expect(calls[1]?.body).toEqual({ hsnCode: '33074100' });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ hsnCode: '33074100', name: 'Rose Agarbatti Deluxe' }),
      'edit',
    );
    expect(screen.getByTestId('product-form-status')).toHaveTextContent('Saved');
  });

  it('locks commercial fields for STAFF and sends a single content request', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope(product));
    renderForm('STAFF');
    await screen.findByRole('textbox', { name: 'Description' });

    expect(screen.getByTestId('commercial-locked')).toBeInTheDocument();
    expect(screen.getByText('Admin only')).toBeInTheDocument();
    for (const id of ['product-hsn', 'product-gst', 'product-featured', 'product-meta-title'])
      expect(screen.getByTestId(id)).toBeDisabled();
    expect(screen.getByTestId('product-name')).toBeEnabled();

    await user.type(screen.getByTestId('product-name'), '!');
    await user.click(screen.getByTestId('product-save'));

    await screen.findByTestId('toast');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`/api/v1/admin/products/${IDS.product}/content`);
  });

  it('creates a product with content fields only and reports the created detail', async () => {
    const user = userEvent.setup();
    const calls = stubFetch(() => okEnvelope(product));
    const onSaved = renderForm('STAFF', null);
    await screen.findByRole('textbox', { name: 'Description' });

    expect(screen.queryByTestId('product-hsn')).toBeNull();
    await user.click(screen.getByTestId('product-save'));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(calls).toHaveLength(0);

    await user.type(screen.getByTestId('product-name'), 'New Dhoop');
    await user.type(screen.getByTestId('product-sku'), 'DHOOP-1');
    await user.selectOptions(screen.getByTestId('product-category'), IDS.dhoop);
    await user.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(product, 'create'));
    expect(calls[0]).toEqual({
      url: '/api/v1/admin/products',
      method: 'POST',
      body: {
        name: 'New Dhoop',
        sku: 'DHOOP-1',
        categoryId: IDS.dhoop,
        description: { type: 'doc', content: [] },
        specifications: {},
        howToUse: null,
        tags: [],
      },
    });
    expect(Object.keys(calls[0]?.body as object)).not.toContain('commercial');
  });

  it('keeps the content save when the commercial step-up is cancelled, and maps server issues', async () => {
    const user = userEvent.setup();
    stubFetch((call, index) =>
      call.url.endsWith('/commercial')
        ? errorEnvelope(403, 'STEP_UP_REQUIRED', 'Recent re-authentication required')
        : index === 1
          ? okEnvelope(product)
          : errorEnvelope(400, 'VALIDATION', 'Request validation failed', [
              { path: 'sku', message: 'SKU already in use' },
            ]),
    );
    const onSaved = renderForm();
    await screen.findByRole('textbox', { name: 'Description' });

    await user.click(screen.getByTestId('product-featured'));
    await user.click(screen.getByTestId('product-save'));
    expect(await screen.findByTestId('product-form-error')).toHaveTextContent(
      'Confirmation was cancelled',
    );
    expect(onSaved).toHaveBeenCalledWith(product, 'edit');

    await user.type(screen.getByTestId('product-name'), '!');
    await user.click(screen.getByTestId('product-save'));
    expect(await screen.findByTestId('product-form-error')).toHaveTextContent(
      'Fix the highlighted fields.',
    );
    expect(screen.getByText('SKU already in use')).toBeInTheDocument();
    expect(screen.getByTestId('product-sku')).toHaveAttribute('aria-invalid', 'true');
  });

  it('guards in-app links and tab close while there are unsaved changes', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderForm();
    await screen.findByRole('textbox', { name: 'Description' });
    const away = screen.getByTestId('away');

    fireEvent.click(away);
    expect(confirm).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('product-name'), '!');
    const prevented = !fireEvent.click(away);
    expect(confirm).toHaveBeenCalledWith(UNSAVED_MESSAGE);
    expect(prevented).toBe(true);

    confirm.mockReturnValue(true);
    expect(fireEvent.click(away)).toBe(true);

    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
  });

  it('shows a generic message when the network fails', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    renderForm();
    await screen.findByRole('textbox', { name: 'Description' });

    await user.click(screen.getByTestId('product-save'));

    expect(await screen.findByTestId('product-form-error')).toHaveTextContent(
      'Could not save. Try again.',
    );
  });
});
