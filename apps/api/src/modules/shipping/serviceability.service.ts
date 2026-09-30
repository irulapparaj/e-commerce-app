import type Redis from 'ioredis';

import type { Serviceability, ShippingPort } from '../../ports/shipping';

export interface ServiceabilityResult {
  readonly serviceable: boolean;
  readonly etaDays: number | null;
  readonly ratePaise: number | null;
  readonly courier: string | null;
}

const CACHE_TTL_SECONDS = 86400; // 24 h

const weightBand = (weightGrams: number): number => Math.ceil(weightGrams / 500) * 500;

const cacheKey = (pincode: string, band: number): string => `svc:${pincode}:${band}`;

const toResult = (raw: Serviceability): ServiceabilityResult => ({
  serviceable: raw.serviceable,
  etaDays: raw.etaDays,
  ratePaise: raw.ratePaise,
  courier: raw.courier,
});

export const checkServiceability = async (
  valkey: Redis,
  shipping: ShippingPort,
  pincode: string,
  weightGrams: number,
): Promise<ServiceabilityResult> => {
  const band = weightBand(weightGrams);
  const key = cacheKey(pincode, band);

  try {
    const cached = await valkey.get(key);
    if (cached !== null) {
      return JSON.parse(cached) as ServiceabilityResult;
    }
  } catch {
    // Valkey unavailable — proceed uncached
  }

  const raw = await shipping.checkServiceability({ pincode, weightGrams });
  const result = toResult(raw);

  try {
    await valkey.setex(key, CACHE_TTL_SECONDS, JSON.stringify(result));
  } catch {
    // Cache failure is non-fatal
  }

  return result;
};
