// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { categoryTree } from '@/test-utils/storefront';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    }),
    usePathname: () => '/',
    useParams: () => ({ locale: 'en' }),
  };
});

import { Header } from './Header';
import { MAIN_CONTENT_ID, SkipLink } from './SkipLink';

describe('Header', () => {
  it('renders the banner with wordmark, navigation, actions and a login link for guests', () => {
    renderWithIntl(
      <>
        <SkipLink />
        <Header
          brandName="Invita Company"
          categories={categoryTree}
          accountHref="/login"
          signedIn={false}
          initialTheme={null}
        />
      </>,
    );
    const header = screen.getByRole('banner');

    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute(
      'href',
      `#${MAIN_CONTENT_ID}`,
    );
    expect(within(header).getByTestId('wordmark')).toHaveTextContent('Invita Company');
    expect(within(header).getByTestId('wordmark')).toHaveAttribute('href', '/');
    expect(within(header).getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(header).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('button', { name: 'Cart, empty' })).toBeInTheDocument();
    expect(screen.queryByTestId('cart-count')).toBeNull();
    expect(
      within(header).getByRole('button', { name: 'Switch to dark theme' }),
    ).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: 'Change look and feel' })).toHaveAttribute(
      'data-skin-state',
      'classic',
    );
    expect(within(header).getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });

  it('clicking the search button opens the search overlay and toggles aria-expanded', () => {
    renderWithIntl(
      <Header
        brandName="Invita Company"
        categories={categoryTree}
        accountHref="/login"
        signedIn={false}
        initialTheme={null}
      />,
    );

    const searchBtn = screen.getByRole('button', { name: 'Search' });
    expect(searchBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(searchBtn);

    expect(searchBtn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('links signed-in visitors to their account and honours the dark cookie hint', () => {
    renderWithIntl(
      <Header
        brandName="Invita Company"
        categories={[]}
        accountHref="/account"
        signedIn
        initialTheme="dark"
      />,
    );

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).toBeNull();
  });
});
