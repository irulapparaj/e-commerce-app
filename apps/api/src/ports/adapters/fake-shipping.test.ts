import { AppError } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { FakeShippingAdapter, laneForPincode } from './fake-shipping';

const address = {
  name: 'A',
  phone: '9876543210',
  line1: 'x',
  city: 'Chennai',
  state: 'TN',
  pincode: '600001',
};

describe('FakeShippingAdapter', () => {
  it.each([
    ['600001', true, 2, 3500],
    ['641001', true, 2, 3500],
    ['110001', true, 5, 6000],
    ['400001', true, 3, 4500],
    ['560001', true, 3, 4500],
    ['700001', true, 5, 6500],
    ['800001', true, 6, 7000],
    ['900001', true, 7, 7500],
    ['000001', false, null, null],
    ['001234', false, null, null],
  ])('serviceability for %s', async (pincode, serviceable, etaDays, ratePaise) => {
    const adapter = new FakeShippingAdapter();

    const result = await adapter.checkServiceability({ pincode, weightGrams: 500 });

    expect(result).toEqual({
      serviceable,
      etaDays,
      ratePaise,
      courier: serviceable ? 'Delhivery' : null,
    });
  });

  it('creates shipments with FAKE-<uuid> AWBs and rejects unserviceable pins', async () => {
    const adapter = new FakeShippingAdapter();

    const shipment = await adapter.createShipment({
      orderId: 'o1',
      orderNumber: 'PE-20260001',
      address,
      weightGrams: 500,
      amountPaise: 59900,
    });

    expect(shipment.awb).toMatch(/^FAKE-[0-9a-f-]{36}$/);
    expect(shipment.courier).toBe('Delhivery');
    await expect(
      adapter.createShipment({
        orderId: 'o2',
        orderNumber: 'PE-20260002',
        address: { ...address, pincode: '000001' },
        weightGrams: 1,
        amountPaise: 1,
      }),
    ).rejects.toThrow(AppError);
  });

  it('progresses tracking status deterministically with time', async () => {
    let now = 1_000_000;
    const adapter = new FakeShippingAdapter(() => now);
    const { awb } = await adapter.createShipment({
      orderId: 'o1',
      orderNumber: 'PE-20260001',
      address,
      weightGrams: 500,
      amountPaise: 1,
    });

    expect((await adapter.track(awb)).status).toBe('PICKUP_SCHEDULED');
    now += 60_000;
    expect((await adapter.track(awb)).status).toBe('IN_TRANSIT');
    now += 60_000 * 2;
    const tracking = await adapter.track(awb);
    expect(tracking.status).toBe('DELIVERED');
    expect(tracking.events).toHaveLength(4);
  });

  it('creates reverse pickups and rejects unknown AWBs', async () => {
    const adapter = new FakeShippingAdapter();

    const pickup = await adapter.createReversePickup({
      returnRequestId: 'r1',
      orderNumber: 'PE-20260001',
      address,
      weightGrams: 200,
    });

    expect(pickup.awb).toMatch(/^FAKE-/);
    expect((await adapter.track(pickup.awb)).status).toBe('PICKUP_SCHEDULED');
    await expect(adapter.track('FAKE-nope')).rejects.toThrow('Unknown AWB');
    expect(laneForPincode('')).toBeNull();
  });
});
