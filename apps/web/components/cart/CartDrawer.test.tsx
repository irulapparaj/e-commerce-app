// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_CART, useCartStore } from '@/stores/cart';
import { renderWithIntl } from '@/test-utils/intl';

import { CartDrawer } from './CartDrawer';

const mockFetch = vi.fn();
global.fetch = mockFetch;

// next-intl useLocale requires a locale in context — renderWithIntl provides "en".
// next/navigation is used by ButtonLink; stub minimal shape.
vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => '/en',
    useParams: () => ({ locale: 'en' }),
  };
});

beforeEach(() => {
  useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: false, open: false });
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CartDrawer', () => {
  it('renders without throwing when the store uses separate primitive selectors', () => {
    // Regression: an inline object selector `(s) => ({ cart, hydrated })` creates a new
    // reference on every call and triggers the React useSyncExternalStore
    // "getServerSnapshot should be cached" infinite-loop error.
    expect(() => renderWithIntl(<CartDrawer />)).not.toThrow();
  });

  it('is closed by default', () => {
    renderWithIntl(<CartDrawer />);
    expect(screen.queryByTestId('cart-drawer')).toBeNull();
  });

  it('shows the empty state when open with no items and hydrated', () => {
    useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: true, open: true });
    renderWithIntl(<CartDrawer />);
    expect(screen.getByTestId('cart-drawer')).toBeInTheDocument();
    expect(screen.getByText(/your cart is empty/i)).toBeInTheDocument();
  });

  it('does not show the empty state while unhydrated even if itemCount is 0', () => {
    useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: false, open: true });
    renderWithIntl(<CartDrawer />);
    // Drawer is open but empty-cart copy must not appear while still loading.
    expect(screen.queryByText(/your cart is empty/i)).toBeNull();
  });

  it('shows cart items when open with items', () => {
    const cartWithItems = {
      ...EMPTY_CART,
      itemCount: 1,
      items: [
        {
          variantId: 'v1',
          productSlug: 'product-a',
          name: 'Product A',
          variantLabel: 'M / Red',
          imageUrl: null,
          unitPricePaise: 100_00,
          quantity: 1,
          lineTotalPaise: 100_00,
          availableQuantity: 10,
          flags: [] as const,
        },
      ],
    };
    useCartStore.setState({ cart: cartWithItems, status: 'idle', hydrated: true, open: true });
    renderWithIntl(<CartDrawer />);
    expect(screen.getByText('Product A')).toBeInTheDocument();
  });

  it('closes when setOpen(false) is called', () => {
    useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: true, open: true });
    renderWithIntl(<CartDrawer />);
    expect(screen.getByTestId('cart-drawer')).toBeInTheDocument();

    act(() => {
      useCartStore.getState().setOpen(false);
    });

    expect(screen.queryByTestId('cart-drawer')).toBeNull();
  });
});
