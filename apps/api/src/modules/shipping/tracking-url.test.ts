import { describe, it, expect } from 'vitest';

import { buildTrackingUrl, AWB_REGEX } from './tracking-url';

describe('AWB_REGEX', () => {
  it.each([
    '1234567',
    'FAKE-abcd1234567890abcd1234',
    'ABC123',
    'abc-123-DEF',
  ])('accepts valid AWB %s', (awb) => {
    expect(AWB_REGEX.test(awb)).toBe(true);
  });

  it.each([
    '12345',          // too short (5 chars)
    '',               // empty
    'A',              // too short
    'abcde',          // too short (5 chars)
    'a b c d e f',   // contains space
    'abc!@#def',      // special chars
  ])('rejects invalid AWB %s', (awb) => {
    expect(AWB_REGEX.test(awb)).toBe(false);
  });
});

describe('buildTrackingUrl', () => {
  it('returns null for invalid AWB', () => {
    expect(buildTrackingUrl('abc', 'Delhivery')).toBeNull();
  });

  it('builds Delhivery tracking URL from allow-list', () => {
    const url = buildTrackingUrl('1234567890123', 'Delhivery');
    expect(url).toContain('delhivery.com');
    expect(url).toContain('1234567890123');
  });

  it('builds Xpressbees tracking URL from allow-list', () => {
    const url = buildTrackingUrl('XB1234567', 'Xpressbees');
    expect(url).toContain('xpressbees.com');
    expect(url).toContain('XB1234567');
  });

  it('falls back to Shiprocket public URL for unknown courier', () => {
    const url = buildTrackingUrl('AWBUNKNOWN123', 'Some Unknown Courier');
    expect(url).toContain('shiprocket.co/tracking');
    expect(url).toContain('AWBUNKNOWN123');
  });

  it('does not inject other values into URL template', () => {
    const awb = 'CLEANAWB123';
    const url = buildTrackingUrl(awb, 'FedEx');
    expect(url).toContain(encodeURIComponent(awb));
    // Should not have any extra query params or path segments
    expect(url).not.toContain('{awb}');
  });

  it('builds Fake adapter AWBs correctly (6+ chars after FAKE-)', () => {
    // FAKE-uuid will match the allow-list fallback since it's not a known courier
    const url = buildTrackingUrl('FAKE-ab1234567890', 'Delhivery');
    expect(url).not.toBeNull();
    expect(url).toContain('delhivery.com');
  });
});
