import { describe, expect, it } from 'vitest';

import { startOfIstDay } from './stats.query';

describe('startOfIstDay', () => {
  it('returns midnight in Asia/Kolkata as a UTC instant', () => {
    expect(startOfIstDay(new Date('2026-09-26T10:00:00Z')).toISOString()).toBe(
      '2026-09-25T18:30:00.000Z',
    );
    expect(startOfIstDay(new Date('2026-09-25T18:29:59Z')).toISOString()).toBe(
      '2026-09-24T18:30:00.000Z',
    );
    expect(startOfIstDay(new Date('2026-09-25T18:30:00Z')).toISOString()).toBe(
      '2026-09-25T18:30:00.000Z',
    );
  });
});
