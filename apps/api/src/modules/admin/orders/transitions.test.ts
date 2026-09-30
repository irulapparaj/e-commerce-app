import { describe, it, expect } from 'vitest';

import { canTransition, cancelEligible, isForwardTransition } from './transitions';

describe('canTransition', () => {
  it.each([
    ['DISPATCHED', 'IN_TRANSIT', true],
    ['DISPATCHED', 'DELIVERED', true],
    ['IN_TRANSIT', 'DELIVERED', true],
    // Invalid transitions
    ['CONFIRMED', 'DISPATCHED', false],  // must use ship service
    ['CONFIRMED', 'DELIVERED', false],
    ['PENDING', 'CONFIRMED', false],
    ['DELIVERED', 'RETURNED', false],    // P22 handles this
    ['CANCELLED', 'CONFIRMED', false],
    ['DISPATCHED', 'CANCELLED', false],  // cannot cancel after dispatch
  ] as const)('from %s → %s: %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected);
  });
});

describe('cancelEligible', () => {
  it.each([
    ['PENDING', true],
    ['CONFIRMED', true],
    ['DISPATCHED', false],
    ['IN_TRANSIT', false],
    ['DELIVERED', false],
    ['CANCELLED', false],
    ['RETURNED', false],
  ] as const)('status %s: %s', (status, expected) => {
    expect(cancelEligible(status)).toBe(expected);
  });
});

describe('isForwardTransition', () => {
  it.each([
    ['PENDING', 'CONFIRMED', true],
    ['CONFIRMED', 'DISPATCHED', true],
    ['DISPATCHED', 'IN_TRANSIT', true],
    ['IN_TRANSIT', 'DELIVERED', true],
    // Regressions
    ['DELIVERED', 'IN_TRANSIT', false],
    ['IN_TRANSIT', 'DISPATCHED', false],
    ['DISPATCHED', 'CONFIRMED', false],
    // Same status (duplicate)
    ['IN_TRANSIT', 'IN_TRANSIT', false],
    // Non-sequential statuses
    ['PENDING', 'DELIVERED', true],
  ] as const)('from %s → %s: %s', (from, to, expected) => {
    expect(isForwardTransition(from, to)).toBe(expected);
  });
});
