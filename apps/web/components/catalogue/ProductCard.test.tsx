// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from '@/components/ui/Toast';
import type { ProductSummaryDto } from '@/lib/api/types';
import { EMPTY_CART, useCartStore } from '@/stores/cart';
import { renderWithIntl } from '@/test-utils/intl';


vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/en',
    useParams: () => ({ locale: 'en' }),
  };
});

import { ProductCard } from './ProductCard';

const product: ProductSummaryDto = {
  id: 'p1',
  slug: 'royale-masala-agarbatti',
  name: 'Royale Masala Agarbatti',
  categorySlug: 'agarbatti-royale-masala',
  defaultVariantId: 'v1',
  priceFrom: 8000,
  compareAtFrom: 9500,
  image: {
    src: 'https://media.test/products/royale/seed-1.webp',
    srcset: { webp: '', avif: '' },
    alt: 'Royale Masala Agarbatti box',
  },
  isFeatured: true,
  inStock: true,
  lowStock: false,
  ratingSummary: { avg: 0, count: 0 },
};

const add = vi.fn<(variantId: string, quantity: number) => Promise<void>>();

const renderCard = (overrides: Partial<ProductSummaryDto> = {}) =>
  renderWithIntl(
    <ToastProvider>
      <ul>
        <ProductCard product={{ ...product, ...overrides }} locale="en" />
      </ul>
    </ToastProvider>,
  );

beforeEach(() => {
  add.mockReset();
  add.mockResolvedValue(undefined);
  useCartStore.setState({ cart: EMPTY_CART, status: 'idle', hydrated: true, open: false, add });
});

describe('ProductCard', () => {
  it('shows name, price, the saving and links the whole card to the product', () => {
    renderCard();
    const card = screen.getByTestId('product-card');

    expect(within(card).getByText('Royale Masala Agarbatti')).toBeInTheDocument();
    expect(within(card).getByTestId('price')).toHaveTextContent('₹80.00');
    expect(within(card).getByTestId('price-compare-at')).toHaveTextContent('₹95.00');
    expect(within(card).getByText('16% off')).toBeInTheDocument();
    expect(within(card).getByText('Sale')).toBeInTheDocument();
    expect(within(card).getByTestId('product-link')).toHaveAttribute(
      'href',
      expect.stringContaining('/products/royale-masala-agarbatti'),
    );
    expect(within(card).getByRole('img')).toHaveAttribute('alt', 'Royale Masala Agarbatti box');
  });

  it('stays quiet about availability unless stock is low or gone', () => {
    renderCard();
    expect(screen.queryByText(/in stock/i)).toBeNull();
    expect(screen.queryByText(/only a few left/i)).toBeNull();
    expect(screen.queryByTestId('quantity-stepper')).toBeNull();
  });

  it('flags low stock', () => {
    renderCard({ lowStock: true, compareAtFrom: null });
    expect(screen.getByText('Only a few left')).toBeInTheDocument();
    expect(screen.queryByText(/% off/)).toBeNull();
  });

  it('disables the button and labels it when out of stock', () => {
    renderCard({ inStock: false });
    const button = screen.getByRole('button', { name: /out of stock/i });
    expect(button).toBeDisabled();
    expect(screen.getAllByText('Out of stock').length).toBeGreaterThan(0);
  });

  it('adds one unit of the default variant and confirms with a toast', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));

    expect(add).toHaveBeenCalledWith('v1', 1);
    expect(screen.getByText('Added to cart')).toBeInTheDocument();
  });

  it('shows the rating only once there are reviews', () => {
    renderCard({ ratingSummary: { avg: 4.5, count: 12 } });
    expect(screen.getByLabelText('Rated 4.5 out of 5 from 12 reviews')).toBeInTheDocument();
  });
});
