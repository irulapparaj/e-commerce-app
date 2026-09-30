// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { PriceFilter } from './PriceFilter';

const bounds = { min: 100, max: 1000, buckets: [3, 1, 0, 5] };

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const countResponse = (total: number) =>
  ({ ok: true, json: () => Promise.resolve({ meta: { page: 1, limit: 12, total } }) }) as Response;

const setup = (props: Partial<Parameters<typeof PriceFilter>[0]> = {}) => {
  const onApply = vi.fn<(min: number, max: number) => void>();
  renderWithIntl(
    <PriceFilter
      min={0}
      max={0}
      bounds={bounds}
      slug="agarbatti"
      total={9}
      onApply={onApply}
      {...props}
    />,
  );
  return { onApply };
};

const apply = () => screen.getByTestId('price-apply');

beforeEach(() => {
  fetchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PriceFilter', () => {
  it('renders the slider over the collection bounds with thumbs resting on them', () => {
    setup();
    const lo = screen.getByTestId('price-slider-min');
    const hi = screen.getByTestId('price-slider-max');
    expect(lo).toHaveValue('100');
    expect(hi).toHaveValue('1000');
    expect(lo).toHaveAttribute('min', '100');
    expect(hi).toHaveAttribute('max', '1000');
  });

  it('draws a histogram bar per bucket and recolours them as the range narrows', () => {
    setup();
    // Buckets over [100, 1000] are 225 wide: mids 212, 437, 662, 887 — all in range at rest.
    const bars = () => [...screen.getByTestId('price-histogram').children];
    expect(bars()).toHaveLength(4);
    expect(bars().every((bar) => (bar as HTMLElement).dataset['inRange'] === 'true')).toBe(true);

    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '300' } });
    fireEvent.change(screen.getByTestId('price-input-max'), { target: { value: '700' } });
    expect(bars().map((bar) => (bar as HTMLElement).dataset['inRange'])).toEqual([
      'false',
      'true',
      'true',
      'false',
    ]);
  });

  it('omits the histogram when the spread has no buckets', () => {
    setup({ bounds: { min: 100, max: 1000, buckets: [] } });
    expect(screen.queryByTestId('price-histogram')).not.toBeInTheDocument();
    expect(screen.getByTestId('price-slider')).toBeInTheDocument();
  });

  it('hides the slider without bounds but keeps the inputs usable', () => {
    const { onApply } = setup({ bounds: null });
    expect(screen.queryByTestId('price-slider')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '200' } });
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith(200, 0);
  });

  it('moving a thumb rewrites the matching text box', () => {
    setup();
    fireEvent.change(screen.getByTestId('price-slider-min'), { target: { value: '250' } });
    expect(screen.getByTestId('price-input-min')).toHaveValue(250);
    fireEvent.change(screen.getByTestId('price-slider-max'), { target: { value: '750' } });
    expect(screen.getByTestId('price-input-max')).toHaveValue(750);
  });

  it('typing moves the thumbs, clamped to the bounds for display only', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByTestId('price-input-max'), { target: { value: '5000' } });
    expect(screen.getByTestId('price-slider-max')).toHaveValue('1000');
    fireEvent.click(apply());
    // 5000 is past the upper bound, so it narrows nothing and stays out of the URL.
    expect(onApply).toHaveBeenCalledWith(0, 0);
  });

  it('thumbs cannot cross', () => {
    setup({ min: 300, max: 500 });
    fireEvent.change(screen.getByTestId('price-slider-min'), { target: { value: '900' } });
    expect(screen.getByTestId('price-slider-min')).toHaveValue('500');
  });

  it('applies actively narrowed values', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '200' } });
    fireEvent.change(screen.getByTestId('price-input-max'), { target: { value: '800' } });
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith(200, 800);
  });

  it('rejects an inverted typed range with a visible error and a plain Apply label', () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '800' } });
    fireEvent.change(screen.getByTestId('price-input-max'), { target: { value: '200' } });
    expect(apply()).toHaveTextContent('Apply');
    fireEvent.click(apply());
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid price range')).toBeInTheDocument();
  });

  it('reset clears the fields and lifts an applied filter', () => {
    const { onApply } = setup({ min: 200, max: 800 });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(onApply).toHaveBeenCalledWith(0, 0);
    expect(screen.getByTestId('price-input-min')).toHaveValue(null);
  });
});

describe('PriceFilter count preview', () => {
  it('seeds the count for the applied range without fetching', () => {
    setup();
    expect(apply()).toHaveTextContent('Show 9 items');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('previews the exact match count for a changed range, debounced', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(countResponse(3));
    setup();

    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '200' } });
    expect(apply()).toHaveTextContent('Apply');
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/categories/agarbatti/products?limit=12&minPrice=20000',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(apply()).toHaveTextContent('Show 3 items');

    // Returning to the applied range needs no request either.
    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '' } });
    expect(apply()).toHaveTextContent('Show 9 items');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('warns about an empty result before the user commits', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(countResponse(0));
    setup({ slug: null });

    fireEvent.change(screen.getByTestId('price-input-max'), { target: { value: '900' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/products?limit=12&maxPrice=90000',
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(apply()).toHaveTextContent('No matching items');
  });

  it('falls back to the plain Apply label when the preview fetch fails', async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error('offline'));
    setup();

    fireEvent.change(screen.getByTestId('price-input-min'), { target: { value: '300' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(apply()).toHaveTextContent('Apply');
  });
});
