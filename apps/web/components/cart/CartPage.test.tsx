// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CART, useCartStore } from '@/stores/cart';
import { renderWithIntl } from '@/test-utils/intl';

import { CartPageClient } from './CartPage';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en/cart',
    useParams: () => ({ locale: 'en' }),
  };
});

beforeEach(() => {
  useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: false, open: false });
  mockFetch.mockReset();
});

describe('CartPageClient', () => {
  it('renders without throwing when the store uses separate primitive selectors', () => {
    // Regression: an inline object selector `(s) => ({ cart, hydrated, hydrate })` creates
    // a new reference on every call and triggers the React useSyncExternalStore
    // "getServerSnapshot should be cached" infinite-loop error.
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: EMPTY_CART }) });
    expect(() => renderWithIntl(<CartPageClient />)).not.toThrow();
  });

  it('shows a loading skeleton while unhydrated', () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: EMPTY_CART }) });
    renderWithIntl(<CartPageClient />);
    // The skeleton container is aria-busy while loading.
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText(/your cart is empty/i)).toBeNull();
  });

  it('shows the empty-cart message after hydration with no items', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: EMPTY_CART }),
    });

    renderWithIntl(<CartPageClient />);

    await act(async () => {
      await useCartStore.getState().hydrate();
    });

    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it('shows cart items after hydration', async () => {
    const cartWithItems = {
      ...EMPTY_CART,
      itemCount: 2,
      items: [
        {
          variantId: 'v1',
          productSlug: 'product-a',
          name: 'Product A',
          variantLabel: 'M / Red',
          imageUrl: null,
          unitPricePaise: 50_00,
          quantity: 2,
          lineTotalPaise: 100_00,
          availableQuantity: 5,
          flags: [] as const,
        },
      ],
      subtotalPaise: 100_00,
    };
    useCartStore.setState({ cart: cartWithItems, status: 'idle', hydrated: true, open: false });

    renderWithIntl(<CartPageClient />);

    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.queryByText(/your cart is empty/i)).toBeNull();
  });

  it('does not call hydrate a second time when already hydrated', async () => {
    useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: true, open: false });

    renderWithIntl(<CartPageClient />);

    await act(async () => {});

    // hydrate() short-circuits when hydrated=true, so fetch is never called.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
