// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { categoryTree, publicSettings } from '@/test-utils/storefront';

import { Footer } from './Footer';

describe('Footer', () => {
  it('renders shop, quick links, policies, business block and social links', () => {
    renderWithIntl(
      <Footer categories={categoryTree} settings={publicSettings} showPlaceholderMarker />,
    );
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getByRole('link', { name: 'Agarbatti' })).toHaveAttribute(
      'href',
      '/collections/agarbatti',
    );
    expect(within(footer).getByRole('link', { name: 'Refund & return policy' })).toHaveAttribute(
      'href',
      '/policies/refund',
    );
    expect(within(footer).getByRole('link', { name: 'Knowledge hub' })).toHaveAttribute(
      'href',
      '/pages/knowledge-hub',
    );
    expect(within(footer).getByRole('link', { name: 'About us' })).toHaveAttribute(
      'href',
      '/pages/about-us',
    );
    expect(within(footer).getByRole('link', { name: 'Grievance officer' })).toHaveAttribute(
      'href',
      '/pages/grievance-redressal',
    );
    const business = screen.getByTestId('business-block');
    expect(business).toHaveTextContent('GSTIN 33AAAAA0000A1Z5');
    expect(business).toHaveTextContent('Udyam');
    expect(business).toHaveTextContent('Dispatched from Chennai');
    expect(screen.getByTestId('placeholder-marker')).toHaveTextContent('placeholder');
    expect(
      within(footer).getByText(new RegExp(`© ${new Date().getFullYear()} Invita Company`)),
    ).toBeInTheDocument();

    const social = within(footer).getByRole('list', { name: 'Follow us' });
    expect(within(social).getAllByRole('link')).toHaveLength(5);
    expect(within(social).getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('hides the placeholder marker in production and keeps the newsletter form inert', () => {
    renderWithIntl(
      <Footer categories={[]} settings={publicSettings} showPlaceholderMarker={false} />,
    );

    expect(screen.queryByTestId('placeholder-marker')).toBeNull();
    const form = screen.getByTestId('newsletter-form');
    expect(screen.getByLabelText('Your email')).toHaveAttribute('type', 'email');
    const submit = fireEvent.submit(form);
    expect(submit).toBe(false);
    expect(screen.getByRole('button', { name: 'Subscribe' })).toHaveAttribute('type', 'submit');
  });
});
