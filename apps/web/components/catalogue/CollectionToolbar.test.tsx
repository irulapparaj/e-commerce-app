// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CollectionParams } from '@/lib/catalogue/params';
import { renderWithIntl } from '@/test-utils/intl';

const push = vi.fn<(href: string) => void>();
// PriceFilter's count preview may schedule a debounced fetch; give jsdom a harmless stub.
vi.stubGlobal('fetch', vi.fn());

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/en/collections/agarbatti',
    useParams: () => ({ locale: 'en' }),
  };
});

import { CollectionToolbar } from './CollectionToolbar';

const params: CollectionParams = { sort: 'featured', min: 0, max: 0, page: 1, view: 'grid' };
const bounds = { min: 100, max: 1000, buckets: [3, 1, 0, 5] };

const setup = (overrides: Partial<Parameters<typeof CollectionToolbar>[0]> = {}) =>
  renderWithIntl(
    <CollectionToolbar
      total={9}
      locale="en"
      slug="agarbatti"
      currentParams={params}
      priceBounds={bounds}
      {...overrides}
    />,
  );

beforeEach(() => {
  push.mockReset();
});

describe('CollectionToolbar', () => {
  it('renders count, filter, sort and view controls on one row', () => {
    setup();
    expect(screen.getByTestId('toolbar-count')).toHaveTextContent('9 items');
    expect(screen.getByTestId('filter-trigger')).toBeInTheDocument();
    expect(screen.getByTestId('sort-trigger')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid view' })).toBeInTheDocument();
  });

  it('applies a price range from the popover and resets to page 1', () => {
    setup({ currentParams: { ...params, page: 3 } });
    fireEvent.click(screen.getByTestId('filter-trigger'));
    const popover = screen.getByTestId('filter-popover');
    fireEvent.change(within(popover).getByTestId('price-input-min'), { target: { value: '200' } });
    fireEvent.change(within(popover).getByTestId('price-input-max'), { target: { value: '800' } });
    fireEvent.click(within(popover).getByTestId('price-apply'));
    expect(push).toHaveBeenCalledWith('/collections/agarbatti?min=200&max=800');
    expect(screen.queryByTestId('filter-popover')).not.toBeInTheDocument();
  });

  it('shows an applied range as a chip whose remove button clears the filter', () => {
    setup({ currentParams: { ...params, min: 200, max: 800 } });
    expect(screen.getByTestId('price-chip')).toHaveTextContent('₹200 – ₹800');
    fireEvent.click(screen.getByTestId('price-chip-remove'));
    expect(push).toHaveBeenCalledWith('/collections/agarbatti');
  });

  it('labels a one-sided range on the chip', () => {
    setup({ currentParams: { ...params, min: 0, max: 500 } });
    expect(screen.getByTestId('price-chip')).toHaveTextContent('Under ₹500');
  });

  it('changing sort pushes the collection URL', () => {
    setup();
    fireEvent.click(screen.getByTestId('sort-trigger'));
    fireEvent.click(screen.getByTestId('sort-option-price_desc'));
    expect(push).toHaveBeenCalledWith('/collections/agarbatti?sort=price_desc');
  });

  it('builds all-products URLs when no slug is given', () => {
    setup({ slug: null });
    fireEvent.click(screen.getByTestId('sort-trigger'));
    fireEvent.click(screen.getByTestId('sort-option-newest'));
    expect(push).toHaveBeenCalledWith('/collections?sort=newest');
  });
});
