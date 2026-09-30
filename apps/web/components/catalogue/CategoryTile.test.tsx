// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';


vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/',
    useParams: () => ({ locale: 'en' }),
  };
});

import { CategoryTile } from './CategoryTile';

describe('CategoryTile', () => {
  it('renders the still under the name and links to the collection', () => {
    renderWithIntl(
      <CategoryTile
        category={{
          slug: 'agarbatti',
          name: 'Agarbatti',
          imageUrl: 'https://media.test/categories/agarbatti-640.webp',
        }}
      />,
    );
    const tile = screen.getByTestId('category-tile');

    expect(tile).toHaveAttribute('href', expect.stringContaining('/collections/agarbatti'));
    expect(tile).toHaveTextContent('Agarbatti');
    expect(tile.querySelector('img')).not.toBeNull();
    expect(screen.queryByTestId('category-tile-fallback')).toBeNull();
  });

  it('falls back to a typographic tile when the category has no image', () => {
    renderWithIntl(<CategoryTile category={{ slug: 'air-care', name: 'Air Care', imageUrl: null }} />);
    const tile = screen.getByTestId('category-tile');

    expect(tile.querySelector('img')).toBeNull();
    expect(screen.getByTestId('category-tile-fallback')).toHaveTextContent('A');
    expect(tile).toHaveTextContent('Air Care');
  });
});
