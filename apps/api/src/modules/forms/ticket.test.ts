import { describe, expect, it } from 'vitest';

import { generateTicketId } from './ticket';

describe('generateTicketId', () => {
  const DATE = new Date('2026-09-26T10:00:00Z');

  it('generates a ticket with contact prefix by default', () => {
    const id = generateTicketId('C', DATE);
    expect(id).toMatch(/^PE-C-20260926-[A-Z2-7]{6}$/);
  });

  it('generates a ticket with seller prefix', () => {
    const id = generateTicketId('S', DATE);
    expect(id).toMatch(/^PE-S-20260926-[A-Z2-7]{6}$/);
  });

  it('generates unique ids across multiple calls', () => {
    const ids = Array.from({ length: 20 }, () => generateTicketId('C', DATE));
    const unique = new Set(ids);
    expect(unique.size).toBe(20);
  });

  it('has exactly 6 base32 characters in the random suffix', () => {
    const id = generateTicketId('C', DATE);
    const parts = id.split('-');
    expect(parts[3]).toHaveLength(6);
  });
});
