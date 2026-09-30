// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SortOption } from '@/lib/catalogue/params';
import { renderWithIntl } from '@/test-utils/intl';

import { SortMenu } from './SortMenu';

const setup = (value: SortOption = 'featured') => {
  const onChange = vi.fn<(value: SortOption) => void>();
  renderWithIntl(<SortMenu value={value} onChange={onChange} />);
  return { onChange };
};

describe('SortMenu', () => {
  it('shows a plain "Sort" trigger on the default and the active label otherwise', () => {
    setup();
    expect(screen.getByTestId('sort-trigger')).toHaveTextContent('Sort');
    fireEvent.click(screen.getByTestId('sort-trigger'));
    expect(screen.getByTestId('sort-trigger')).toHaveAttribute('aria-expanded', 'true');
  });

  it('names the active sort on the trigger once it moves off the default', () => {
    setup('price_asc');
    expect(screen.getByTestId('sort-trigger')).toHaveTextContent('Price: Low to High');
  });

  it('marks only the active option checked and selects on click', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('sort-trigger'));
    const options = screen.getAllByRole('menuitemradio');
    expect(options).toHaveLength(4);
    expect(screen.getByTestId('sort-option-featured')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('sort-option-newest')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByTestId('sort-option-newest'));
    expect(onChange).toHaveBeenCalledWith('newest');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('re-selecting the active option closes without a redundant navigation', () => {
    const { onChange } = setup('newest');
    fireEvent.click(screen.getByTestId('sort-trigger'));
    fireEvent.click(screen.getByTestId('sort-option-newest'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('supports arrow-key movement and Escape returns focus to the trigger', () => {
    setup();
    fireEvent.click(screen.getByTestId('sort-trigger'));
    const menu = screen.getByRole('menu');
    expect(screen.getByTestId('sort-option-featured')).toHaveFocus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(screen.getByTestId('sort-option-price_asc')).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    // Wraps from the first entry to the last.
    expect(screen.getByTestId('sort-option-newest')).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByTestId('sort-option-featured')).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('sort-trigger')).toHaveFocus();
  });
});
