// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithIntl } from '@/test-utils/intl';
import { publicSettings } from '@/test-utils/storefront';

import { DeliveryNotes } from './DeliveryNotes';
import { TrustStrip } from './TrustStrip';

describe('TrustStrip', () => {
  it('reads the four trust facts from settings as one compact line', () => {
    renderWithIntl(<TrustStrip settings={publicSettings} />);
    const strip = screen.getByRole('region', { name: 'Why shop with us' });

    expect(within(strip).getAllByRole('listitem')).toHaveLength(4);
    expect(within(strip).getByText('Free shipping above ₹599')).toBeInTheDocument();
    expect(within(strip).getByText('15-day returns')).toBeInTheDocument();
    expect(within(strip).getByText('Secure Razorpay checkout')).toBeInTheDocument();
    expect(within(strip).getByText('Ships from Chennai')).toBeInTheDocument();
  });

  it('speaks of tracked delivery when there is no free-shipping threshold', () => {
    renderWithIntl(<TrustStrip settings={{ ...publicSettings, freeShippingThreshold: 0 }} />);

    expect(screen.getByText('Tracked delivery across India')).toBeInTheDocument();
    expect(screen.queryByText(/free shipping/i)).toBeNull();
  });
});

describe('DeliveryNotes', () => {
  it('lists shipping, dispatch, returns and secure checkout under the buy box', () => {
    renderWithIntl(<DeliveryNotes settings={publicSettings} />);
    const notes = screen.getByTestId('delivery-notes');

    expect(within(notes).getByRole('heading', { name: 'Delivery & returns' })).toBeInTheDocument();
    expect(within(notes).getByText('Free shipping on orders above ₹599')).toBeInTheDocument();
    expect(within(notes).getByText('Dispatched from Chennai')).toBeInTheDocument();
    expect(
      within(notes).getByText('15-day returns, refunded to your original payment method'),
    ).toBeInTheDocument();
    expect(within(notes).getAllByRole('listitem')).toHaveLength(4);
  });
});
