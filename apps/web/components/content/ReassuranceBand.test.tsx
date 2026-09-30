// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';

import { ReassuranceBand } from './ReassuranceBand';

describe('ReassuranceBand', () => {
  it('states the three purity facts under the trust heading', () => {
    renderWithIntl(<ReassuranceBand />);
    const band = screen.getByTestId('reassurance-band');

    expect(
      within(band).getByRole('heading', { level: 2, name: 'Why devotees trust us' }),
    ).toBeInTheDocument();

    const items = within(band).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(
      within(band).getByRole('heading', { level: 3, name: 'Nothing synthetic' }),
    ).toBeInTheDocument();
    expect(
      within(band).getByRole('heading', { level: 3, name: 'Small-batch & fresh' }),
    ).toBeInTheDocument();
    expect(
      within(band).getByRole('heading', { level: 3, name: 'Chosen by hand' }),
    ).toBeInTheDocument();
    expect(within(band).getByText(/Every ingredient is listed on the pack/)).toBeInTheDocument();
  });

  it('is a labelled region so landmarks navigation announces it', () => {
    renderWithIntl(<ReassuranceBand />);
    expect(screen.getByRole('region', { name: 'Why devotees trust us' })).toBeInTheDocument();
  });
});
