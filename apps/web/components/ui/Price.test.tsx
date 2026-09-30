// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Price } from './Price';

describe('Price', () => {
  it.each([
    [8000, '₹80.00'],
    [0, '₹0.00'],
    [5, '₹0.05'],
    [123456789, '₹12,34,567.89'],
    [100000000, '₹10,00,000.00'],
  ])('formats %i paise as %s with Indian grouping', (paise, expected) => {
    renderWithIntl(<Price amount={paise} />);

    expect(screen.getByTestId('price')).toHaveTextContent(expected);
    expect(screen.queryByTestId('price-compare-at')).toBeNull();
  });

  it('strikes through the compare-at price and labels both for screen readers', () => {
    renderWithIntl(<Price amount={64900} compareAt={79900} />);

    const compare = screen.getByTestId('price-compare-at');
    expect(compare.tagName).toBe('S');
    expect(compare).toHaveTextContent('Regular price ₹799.00');
    expect(screen.getByText('Sale price')).toHaveClass('sr-only');
    expect(screen.getByText('Regular price')).toHaveClass('sr-only');
    expect(screen.getByTestId('price')).toHaveTextContent(
      'Sale price ₹649.00Regular price ₹799.00',
    );
  });

  it('ignores a compare-at price that is not higher than the amount', () => {
    renderWithIntl(<Price amount={64900} compareAt={64900} size="lg" />);

    expect(screen.queryByTestId('price-compare-at')).toBeNull();
    expect(screen.queryByText('Sale price')).toBeNull();
    expect(screen.getByTestId('price')).toHaveClass('tabular-nums', 'text-h3');
  });

  it('applies the small size', () => {
    renderWithIntl(<Price amount={4999} size="sm" />);
    expect(screen.getByTestId('price')).toHaveClass('text-small');
  });
});
