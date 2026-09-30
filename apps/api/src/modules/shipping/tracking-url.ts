import { COURIER_TRACKING_URLS } from '@pe/shared';

/** AWB must match this regex before interpolation into any URL template. */
export const AWB_REGEX = /^[A-Za-z0-9-]{6,40}$/;

/** Shiprocket public tracking URL used as a fallback for unknown couriers. */
const SHIPROCKET_FALLBACK = 'https://shiprocket.co/tracking/{awb}';

/**
 * Build a tracking URL for a shipment.
 *
 * Rules:
 * - The AWB is validated against AWB_REGEX; returns null for invalid AWBs.
 * - Only known couriers in the allow-list get a first-party URL.
 * - Unknown couriers fall back to the Shiprocket public tracking URL.
 * - Never interpolates anything other than the validated AWB.
 */
export const buildTrackingUrl = (awb: string, courierName: string): string | null => {
  if (!AWB_REGEX.test(awb)) return null;

  const template = COURIER_TRACKING_URLS[courierName] ?? SHIPROCKET_FALLBACK;
  return template.replace('{awb}', encodeURIComponent(awb));
};
