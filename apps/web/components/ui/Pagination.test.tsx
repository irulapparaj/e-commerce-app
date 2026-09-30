// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { Breadcrumb } from './Breadcrumb';
import { Pagination, pageWindow } from './Pagination';

describe('pageWindow', () => {
  it.each([
    [1, 1, [1]],
    [1, 5, [1, 2, 3, 4, 5]],
    [1, 12, [1, 2, 'gap', 12]],
    [5, 12, [1, 'gap', 4, 5, 6, 'gap', 12]],
    [12, 12, [1, 'gap', 11, 12]],
    [4, 12, [1, 2, 3, 4, 5, 'gap', 12]],
    [9, 12, [1, 'gap', 8, 9, 10, 11, 12]],
    [3, 7, [1, 2, 3, 4, 5, 6, 7]],
    [3, 4, [1, 2, 3, 4]],
    [2, 0, []],
  ])('page %i of %i → %j', (page, total, expected) => {
    expect(pageWindow(page, total)).toEqual(expected);
  });
});

describe('Pagination', () => {
  const hrefFor = (page: number) => `/collections/agarbatti?page=${page}`;

  it('renders links with the current page marked and neighbours reachable', () => {
    renderWithIntl(<Pagination page={5} totalPages={12} hrefFor={hrefFor} />);

    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Page 5' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', hrefFor(4));
    expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', hrefFor(6));
    expect(screen.getByRole('link', { name: 'Page 12' })).toHaveAttribute('href', hrefFor(12));
    expect(screen.getAllByText('…')).toHaveLength(2);
  });

  it('drops the previous link on the first page and the next link on the last', () => {
    const { rerender } = renderWithIntl(<Pagination page={1} totalPages={3} hrefFor={hrefFor} />);
    expect(screen.queryByRole('link', { name: 'Previous page' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Next page' })).toBeInTheDocument();

    rerender(<Pagination page={3} totalPages={3} hrefFor={hrefFor} />);
    expect(screen.queryByRole('link', { name: 'Next page' })).toBeNull();
  });

  it('renders nothing for a single page', () => {
    renderWithIntl(<Pagination page={1} totalPages={1} hrefFor={hrefFor} />);
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('Breadcrumb', () => {
  it('links every item except the current page', () => {
    renderWithIntl(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Agarbatti', href: '/collections/agarbatti' },
          { label: 'Unlinked' },
          { label: 'Royale Masala' },
        ]}
      />,
    );

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Agarbatti' })).toHaveAttribute(
      'href',
      '/collections/agarbatti',
    );
    expect(screen.getByText('Unlinked')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Royale Masala')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Royale Masala' })).toBeNull();
  });
});
