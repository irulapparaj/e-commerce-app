// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import type * as NextNavigation from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { publicSettings } from '@/test-utils/storefront';

vi.mock('next/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof NextNavigation>();
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => '/',
    useParams: () => ({ locale: 'en' }),
  };
});

import { Hero } from './Hero';

describe('Hero', () => {
  it('leads with the value proposition, the tagline as eyebrow and one accent CTA', () => {
    renderWithIntl(<Hero settings={publicSettings} />);
    const hero = screen.getByTestId('hero');

    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      'Everything your daily puja needs, in one place',
    );
    expect(within(hero).getByText('Quality products, thoughtfully delivered.')).toBeInTheDocument();
    expect(within(hero).getByText(/dispatched from Chennai/)).toBeInTheDocument();
    expect(within(hero).getByTestId('hero-cta')).toHaveAttribute(
      'href',
      expect.stringContaining('/collections'),
    );
    expect(within(hero).getByRole('link', { name: /explore categories/i })).toHaveAttribute(
      'href',
      '#shop-by-category',
    );
  });

  it('omits the eyebrow when the brand has no tagline', () => {
    renderWithIntl(
      <Hero settings={{ ...publicSettings, brand: { ...publicSettings.brand, tagline: '' } }} />,
    );
    expect(screen.queryByText('Quality products, thoughtfully delivered.')).toBeNull();
  });
});
