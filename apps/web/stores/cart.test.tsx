// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CART, useCartCount, useCartStore } from './cart';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const makeCartResponse = (itemCount: number) => ({
  success: true,
  data: { ...EMPTY_CART, itemCount, items: [], subtotalPaise: 0 },
});

beforeEach(() => {
  useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: false, open: false });
  mockFetch.mockReset();
});

describe('useCartCount', () => {
  it('returns 0 for empty cart', () => {
    const { result } = renderHook(() => useCartCount());
    expect(result.current).toBe(0);
  });
});

describe('cart store add', () => {
  it('optimistically increments itemCount', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCartResponse(1),
    });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.add('variant-1', 1);
    });

    expect(countResult.current).toBe(1);
  });

  it('rolls back on API error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.add('variant-1', 2);
    });

    expect(countResult.current).toBe(0);
    expect(storeResult.current.status).toBe('error');
  });
});

describe('cart store update', () => {
  it('updates cart when API confirms', async () => {
    useCartStore.setState({
      cart: { ...EMPTY_CART, itemCount: 1, items: [{ variantId: 'variant-1', productSlug: 'p', name: 'P', variantLabel: '', imageUrl: null, unitPricePaise: 100, quantity: 1, lineTotalPaise: 100, availableQuantity: 5, flags: [] }] },
      status: 'idle',
      open: false,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCartResponse(3),
    });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.update('variant-1', 3);
    });

    expect(countResult.current).toBe(3);
    expect(storeResult.current.status).toBe('idle');
  });

  it('rolls back to original cart on API error', async () => {
    const originalCart = { ...EMPTY_CART, itemCount: 2 };
    useCartStore.setState({ cart: originalCart, status: 'idle', open: false });
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.update('variant-1', 5);
    });

    expect(countResult.current).toBe(2);
    expect(storeResult.current.status).toBe('error');
  });
});

describe('cart store remove', () => {
  it('removes item when API confirms', async () => {
    useCartStore.setState({
      cart: { ...EMPTY_CART, itemCount: 1 },
      status: 'idle',
      open: false,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCartResponse(0),
    });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.remove('variant-1');
    });

    expect(countResult.current).toBe(0);
    expect(storeResult.current.status).toBe('idle');
  });

  it('rolls back to original cart on API error', async () => {
    const originalCart = { ...EMPTY_CART, itemCount: 2 };
    useCartStore.setState({ cart: originalCart, status: 'idle', open: false });
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.remove('variant-2');
    });

    expect(countResult.current).toBe(2);
    expect(storeResult.current.status).toBe('error');
  });
});

describe('cart store hydrate', () => {
  it('loads cart state from API and marks hydrated', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => makeCartResponse(4),
    });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.hydrate();
    });

    expect(countResult.current).toBe(4);
    expect(storeResult.current.status).toBe('idle');
    expect(storeResult.current.hydrated).toBe(true);
  });

  it('leaves cart empty on API failure but still marks hydrated', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    const { result: storeResult } = renderHook(() => useCartStore());
    const { result: countResult } = renderHook(() => useCartCount());

    await act(async () => {
      await storeResult.current.hydrate();
    });

    expect(countResult.current).toBe(0);
    // H-15: API failure leaves cart in error state so UI can show the error message
    expect(storeResult.current.status).toBe('error');
    expect(storeResult.current.errorMessage).toBe('Failed to load cart');
    expect(storeResult.current.hydrated).toBe(true);
  });

  it('does not fetch again if already hydrated', async () => {
    useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: true, open: false });
    const { result: storeResult } = renderHook(() => useCartStore());

    await act(async () => {
      await storeResult.current.hydrate();
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('cart store setOpen', () => {
  it('toggles the cart open state', () => {
    const { result } = renderHook(() => useCartStore());
    expect(result.current.open).toBe(false);

    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });
});

