import { describe, expect, it } from 'vitest';

import {
  HOME_SETTING_KEYS,
  isSettingKey,
  parseSetting,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  toPublicSettings,
} from './settings';

describe('settings schemas', () => {
  it('accepts every seeded default', () => {
    for (const key of SETTING_KEYS)
      expect(parseSetting(key, SETTING_DEFAULTS[key]).success, key).toBe(true);
  });

  it('validates GSTIN as a Tamil Nadu registration and clears the placeholder flag on a real profile', () => {
    const real = {
      gstin: '33ABCDE1234F1Z5',
      legalName: 'Real Co',
      addressLines: ['1 Street'],
      isPlaceholder: false,
    };

    expect(parseSetting('gst_profile', real).success).toBe(true);
    expect(parseSetting('gst_profile', { ...real, gstin: '29ABCDE1234F1Z5' }).success).toBe(false);
    expect(parseSetting('gst_profile', { ...real, gstin: '33abcde1234f1z5' }).success).toBe(false);
    expect(parseSetting('gst_profile', { ...real, addressLines: [] }).success).toBe(false);
    expect(parseSetting('gst_profile', { ...real, extra: 1 }).success).toBe(false);
  });

  it('bounds thresholds, windows and popup delays', () => {
    expect(parseSetting('free_shipping_threshold', 0).success).toBe(true);
    expect(parseSetting('free_shipping_threshold', -1).success).toBe(false);
    expect(parseSetting('free_shipping_threshold', 59900.5).success).toBe(false);
    expect(parseSetting('return_window_days', 7).success).toBe(true);
    expect(parseSetting('return_window_days', 31).success).toBe(false);
    expect(parseSetting('promo_popup', { enabled: true, delaySeconds: 2 }).success).toBe(false);
    expect(parseSetting('promo_popup', { enabled: true, productSlug: 'Bad Slug' }).success).toBe(
      false,
    );
    const withDefault = parseSetting('promo_popup', { enabled: false });
    expect(withDefault.success && withDefault.data.delaySeconds).toBe(5);
  });

  it('rejects svg logos and over-long brand text', () => {
    expect(
      parseSetting('brand', { name: 'Puja', tagline: '', logoKey: 'brand/logo.webp' }).success,
    ).toBe(true);
    expect(
      parseSetting('brand', { name: 'Puja', tagline: '', logoKey: 'brand/logo.svg' }).success,
    ).toBe(false);
    expect(
      parseSetting('brand', { name: 'x'.repeat(41), tagline: '', logoKey: null }).success,
    ).toBe(false);
  });

  it('constrains the pickup location to Tamil Nadu with a valid PIN and phone', () => {
    const base = SETTING_DEFAULTS.pickup_location;

    expect(parseSetting('pickup_location', { ...base, state: 'KA' }).success).toBe(false);
    expect(parseSetting('pickup_location', { ...base, pincode: '60000' }).success).toBe(false);
    expect(parseSetting('pickup_location', { ...base, phone: '1234567890' }).success).toBe(false);
  });

  it('only allows couriers from the allow-list', () => {
    expect(parseSetting('courier_preferences', { preferred: ['Delhivery', 'DTDC'] }).success).toBe(
      true,
    );
    expect(parseSetting('courier_preferences', { preferred: ['Speedy Unknown'] }).success).toBe(
      false,
    );
  });

  it('recognises keys and exposes the public subset', () => {
    expect(isSettingKey('brand')).toBe(true);
    expect(isSettingKey('__proto__')).toBe(false);
    expect(isSettingKey('nope')).toBe(false);
    expect(HOME_SETTING_KEYS).toContain('announcement_bar');
    const pub = toPublicSettings(SETTING_DEFAULTS);
    expect(pub.pickupLocation).toEqual({ city: 'Chennai' });
    expect(pub).not.toHaveProperty('gst_profile');
    expect(pub.business).toEqual({
      legalName: 'Invita Company (placeholder)',
      gstin: '33AAAAA0000A1Z5',
      addressLines: ['Placeholder address', 'Chennai 600001'],
      isPlaceholder: true,
    });
    expect(Object.keys(pub).sort()).toEqual([
      'announcementBar',
      'brand',
      'business',
      'freeShippingThreshold',
      'pickupLocation',
      'promoPopup',
      'returnWindowDays',
    ]);
  });
});
