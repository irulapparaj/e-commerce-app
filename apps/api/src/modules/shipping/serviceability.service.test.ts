import { describe, expect, it, vi } from 'vitest';

import type { Serviceability, ShippingPort } from '../../ports/shipping';

import { checkServiceability } from './serviceability.service';
import type { ServiceabilityResult } from './serviceability.service';

// Redis stub
const makeValkey = (cached: string | null = null) => ({
  get: vi.fn().mockResolvedValue(cached),
  setex: vi.fn().mockResolvedValue('OK'),
});

// ShippingPort stub
const makeShipping = (result: Serviceability) => {
  const checkServiceabilityMock = vi.fn().mockResolvedValue(result);
  const port: ShippingPort = {
    checkServiceability: checkServiceabilityMock,
    createShipment: vi.fn(),
    cancelShipment: vi.fn(),
    createReversePickup: vi.fn(),
    track: vi.fn(),
  };
  return { port, checkServiceabilityMock };
};

const SERVICEABLE: Serviceability = {
  serviceable: true,
  etaDays: 3,
  ratePaise: 5500,
  courier: 'Delhivery',
};

const NOT_SERVICEABLE: Serviceability = {
  serviceable: false,
  etaDays: null,
  ratePaise: null,
  courier: null,
};

describe('checkServiceability', () => {
  it('calls shippingPort.checkServiceability with the correct input', async () => {
    const valkey = makeValkey();
    const { port, checkServiceabilityMock } = makeShipping(SERVICEABLE);

    await checkServiceability(valkey as never, port, '600001', 500);

    expect(checkServiceabilityMock).toHaveBeenCalledWith({
      pincode: '600001',
      weightGrams: 500,
    });
  });

  it('returns serviceable result with ratePaise from the shipping port', async () => {
    const valkey = makeValkey();
    const { port } = makeShipping(SERVICEABLE);

    const result = await checkServiceability(valkey as never, port, '600001', 500);

    expect(result.serviceable).toBe(true);
    expect(result.ratePaise).toBe(5500);
    expect(result.courier).toBe('Delhivery');
  });

  it('returns not-serviceable result when port returns serviceable:false', async () => {
    const valkey = makeValkey();
    const { port } = makeShipping(NOT_SERVICEABLE);

    const result = await checkServiceability(valkey as never, port, '001234', 500);

    expect(result.serviceable).toBe(false);
    expect(result.ratePaise).toBeNull();
    expect(result.etaDays).toBeNull();
  });

  it('returns cached result without calling the shipping port', async () => {
    const cached: ServiceabilityResult = {
      serviceable: true,
      etaDays: 2,
      ratePaise: 3500,
      courier: 'DTDC',
    };
    const valkey = makeValkey(JSON.stringify(cached));
    const { port, checkServiceabilityMock } = makeShipping(SERVICEABLE);

    const result = await checkServiceability(valkey as never, port, '600001', 500);

    expect(checkServiceabilityMock).not.toHaveBeenCalled();
    expect(result.ratePaise).toBe(3500);
  });

  it('does NOT return hardcoded 4900 for a valid serviceable pincode', async () => {
    const valkey = makeValkey();
    const { port } = makeShipping({ ...SERVICEABLE, ratePaise: 6500 });

    const result = await checkServiceability(valkey as never, port, '600001', 500);

    expect(result.ratePaise).not.toBe(4900);
    expect(result.ratePaise).toBe(6500);
  });
});
