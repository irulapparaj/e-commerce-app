// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { clampRating, Testimonials } from './Testimonials';

describe('clampRating', () => {
  it('parses message ratings and clamps them to the five-star scale', () => {
    expect(clampRating('4')).toBe(4);
    expect(clampRating('9')).toBe(5);
    expect(clampRating('-2')).toBe(0);
    expect(clampRating('4.6')).toBe(5);
    expect(clampRating('not-a-number')).toBe(0);
  });
});

describe('Testimonials', () => {
  it('renders the three curated quotes with attribution and verified marks', () => {
    renderWithIntl(<Testimonials />);
    const section = screen.getByTestId('testimonials');

    expect(
      within(section).getByRole('heading', { level: 2, name: 'Trusted for the daily puja' }),
    ).toBeInTheDocument();
    expect(within(section).getByText('From our customers')).toBeInTheDocument();

    const cards = within(section).getAllByRole('listitem');
    expect(cards).toHaveLength(3);
    expect(within(section).getByText('Meenakshi R.')).toBeInTheDocument();
    expect(within(section).getByText(/sambrani smells exactly/)).toBeInTheDocument();
    expect(within(section).getAllByText('Verified buyer')).toHaveLength(3);
  });

  it('shows each quote’s rating as an accessible five-star scale', () => {
    renderWithIntl(<Testimonials />);
    const section = screen.getByTestId('testimonials');

    expect(within(section).getAllByRole('img', { name: 'Rated 5 out of 5' })).toHaveLength(2);
    const fourStars = within(section).getByRole('img', { name: 'Rated 4 out of 5' });
    expect(fourStars).toBeInTheDocument();
    // 4 of the 5 glyphs filled, the last one on the hairline tone.
    expect(fourStars.querySelectorAll('.text-warning')).toHaveLength(4);
    expect(fourStars.querySelectorAll('.text-hairline')).toHaveLength(1);
  });
});
