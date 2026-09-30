import { randomBytes } from 'node:crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const toBase32 = (bytes: Buffer, length: number): string => {
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_CHARS[(value >> bits) & 0x1f];
    }
  }
  return result.slice(0, length).toUpperCase();
};

/**
 * Generates a human-readable ticket ID in the format PE-C-YYYYMMDD-XXXXXX
 * where XXXXXX is 6 base-32 characters from 5 random bytes.
 */
export const generateTicketId = (prefix: 'C' | 'S' = 'C', now = new Date()): string => {
  const date = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, '');
  const rand = toBase32(randomBytes(5), 6);
  return `PE-${prefix}-${date}-${rand}`;
};
