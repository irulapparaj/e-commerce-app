import { describe, expect, it } from 'vitest';

import {
  boundsToRupees,
  clampToBounds,
  paramsForThumbs,
  sliderStep,
  thumbsFor,
} from './price-range';

describe('boundsToRupees', () => {
  it('floors the min and ceils the max so every product stays inside', () => {
    expect(boundsToRupees({ min: 4950, max: 129_901 })).toEqual({ min: 49, max: 1300, buckets: [] });
  });

  it('carries the histogram buckets through', () => {
    expect(boundsToRupees({ min: 100, max: 1000, buckets: [1, 0, 2] })).toEqual({
      min: 1,
      max: 10,
      buckets: [1, 0, 2],
    });
  });

  it('returns null for missing or degenerate ranges', () => {
    expect(boundsToRupees(null)).toBeNull();
    expect(boundsToRupees(undefined)).toBeNull();
    // A single-price catalogue leaves nothing to slide over.
    expect(boundsToRupees({ min: 8000, max: 8000 })).toBeNull();
  });
});

describe('sliderStep', () => {
  it('scales with the range width', () => {
    expect(sliderStep({ min: 0, max: 100 })).toBe(1);
    expect(sliderStep({ min: 0, max: 600 })).toBe(10);
    expect(sliderStep({ min: 0, max: 3000 })).toBe(50);
    expect(sliderStep({ min: 1000, max: 9000 })).toBe(100);
  });
});

describe('clampToBounds', () => {
  it('keeps values inside the bounds', () => {
    const bounds = { min: 50, max: 500 };
    expect(clampToBounds(10, bounds)).toBe(50);
    expect(clampToBounds(9999, bounds)).toBe(500);
    expect(clampToBounds(200, bounds)).toBe(200);
  });
});

describe('thumbsFor', () => {
  const bounds = { min: 100, max: 1000 };

  it('rests unset values on the bounds', () => {
    expect(thumbsFor(0, 0, bounds)).toEqual({ lo: 100, hi: 1000 });
  });

  it('clamps values typed beyond the bounds for display', () => {
    expect(thumbsFor(10, 5000, bounds)).toEqual({ lo: 100, hi: 1000 });
  });

  it('orders an inverted pair', () => {
    expect(thumbsFor(800, 300, bounds)).toEqual({ lo: 300, hi: 800 });
  });
});

describe('paramsForThumbs', () => {
  const bounds = { min: 100, max: 1000 };

  it('drops thumbs resting on their bound from the URL', () => {
    expect(paramsForThumbs(100, 1000, bounds)).toEqual({ min: 0, max: 0 });
  });

  it('keeps actively narrowed values', () => {
    expect(paramsForThumbs(200, 800, bounds)).toEqual({ min: 200, max: 800 });
  });
});
