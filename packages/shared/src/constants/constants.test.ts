import { describe, expect, it } from 'vitest';

import {
  COURIER_TRACKING_HOSTS,
  DEFAULT_HSN_BY_CATEGORY,
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  findState,
  GST_RATES,
  HSN_CODES,
  INDIAN_STATES,
  isAllowedCourier,
  STATE_CODES,
} from './index';

describe('Indian states', () => {
  it('lists 36 states and union territories with unique codes', () => {
    expect(INDIAN_STATES).toHaveLength(36);
    expect(new Set(STATE_CODES).size).toBe(36);
    expect(new Set(INDIAN_STATES.map((s) => s.gstCode)).size).toBe(36);
  });

  it('resolves Tamil Nadu to GST state code 33', () => {
    expect(findState('TN')).toMatchObject({ name: 'Tamil Nadu', gstCode: '33' });
    expect(findState('XX')).toBeUndefined();
  });
});

describe('HSN defaults', () => {
  it('maps every category default to a known HSN code and rate', () => {
    const codes = new Set(HSN_CODES.map((h) => h.code));
    for (const entry of Object.values(DEFAULT_HSN_BY_CATEGORY)) {
      expect(codes.has(entry.hsnCode)).toBe(true);
      expect(GST_RATES).toContain(entry.gstRate);
    }
  });
});

describe('couriers', () => {
  it('allows only listed couriers', () => {
    expect(isAllowedCourier('Delhivery')).toBe(true);
    expect(isAllowedCourier('Random Courier')).toBe(false);
    expect(COURIER_TRACKING_HOSTS).not.toContain('');
  });
});

describe('defaults', () => {
  it('sets the free shipping threshold to ₹599', () => {
    expect(FREE_SHIPPING_THRESHOLD_DEFAULT).toBe(59900);
  });
});
