import { describe, it, expect } from 'vitest';

import { mapShiprocketStatus, mapShipmentToOrderStatus } from './status-map';

describe('mapShiprocketStatus', () => {
  it.each([
    ['SHIPPED', 'PICKUP_SCHEDULED'],
    ['AWB Assigned', 'PICKUP_SCHEDULED'],
    ['Pickup Scheduled', 'PICKUP_SCHEDULED'],
    ['Pickup Queued', 'PICKUP_SCHEDULED'],
    ['Manifest Generated', 'PICKUP_SCHEDULED'],
    ['In Transit', 'IN_TRANSIT'],
    ['Reached at Destination Hub', 'IN_TRANSIT'],
    ['In Transit - Destination', 'IN_TRANSIT'],
    ['Reached at Origin Hub', 'IN_TRANSIT'],
    ['Out for Delivery', 'OUT_FOR_DELIVERY'],
    ['Out For Delivery', 'OUT_FOR_DELIVERY'],
    ['Delivered', 'DELIVERED'],
    ['DELIVERED', 'DELIVERED'],
    ['RTO Initiated', 'RTO'],
    ['RTO Delivered', 'RTO'],
    ['RTO In Transit', 'RTO'],
    ['Return Initiated', 'RTO'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(mapShiprocketStatus(input)).toBe(expected);
  });

  it.each([
    'Pending',
    'UNKNOWN_STATUS',
    'Order Created',
    '',
    'some random text',
  ])('returns null for unknown status %s', (input) => {
    expect(mapShiprocketStatus(input)).toBeNull();
  });
});

describe('mapShipmentToOrderStatus', () => {
  it.each([
    ['PICKUP_SCHEDULED', 'DISPATCHED'],
    ['IN_TRANSIT', 'IN_TRANSIT'],
    ['OUT_FOR_DELIVERY', 'IN_TRANSIT'],
    ['DELIVERED', 'DELIVERED'],
    ['RTO', 'RETURNED'],
  ] as const)('maps %s → %s', (input, expected) => {
    expect(mapShipmentToOrderStatus(input)).toBe(expected);
  });
});
