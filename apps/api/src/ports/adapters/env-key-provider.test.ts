import { randomBytes } from 'node:crypto';

import { AppError } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { isCiphertext } from '../key-provider';

import { EnvKeyProvider } from './env-key-provider';

const keyA = randomBytes(32);
const keyB = randomBytes(32);
const hmacA = randomBytes(32);
const hmacB = randomBytes(32);

describe('EnvKeyProvider', () => {
  it('round-trips plaintext through a versioned envelope', () => {
    const provider = new EnvKeyProvider(keyA, hmacA);
    const envelope = provider.encrypt('9876543210');

    expect(isCiphertext(envelope)).toBe(true);
    expect(envelope.split(':')).toHaveLength(4);
    expect(provider.decrypt(envelope)).toBe('9876543210');
    expect(provider.decrypt(provider.encrypt(''))).toBe('');
    expect(provider.decrypt(provider.encrypt('12 Temple St, Mylapore ✨'))).toBe(
      '12 Temple St, Mylapore ✨',
    );
  });

  it('uses a fresh IV on every call', () => {
    const provider = new EnvKeyProvider(keyA, hmacA);

    expect(provider.encrypt('same')).not.toBe(provider.encrypt('same'));
  });

  it('rejects tampered ciphertext, the wrong key and malformed envelopes', () => {
    const provider = new EnvKeyProvider(keyA, hmacA);
    const other = new EnvKeyProvider(keyB, hmacA);
    const envelope = provider.encrypt('secret');
    const [v, iv, tag, data] = envelope.split(':') as [string, string, string, string];
    const flipped = `${data.slice(0, -2)}${data.endsWith('AA') ? 'BB' : 'AA'}`;

    expect(() => provider.decrypt(`${v}:${iv}:${tag}:${flipped}`)).toThrow(AppError);
    expect(() => other.decrypt(envelope)).toThrow(AppError);
    expect(() => provider.decrypt('v2:a:b:c')).toThrow('Unsupported');
    expect(() => provider.decrypt('v1:a:b')).toThrow('Unsupported');
    expect(() => provider.decrypt('v1:aa:bb:cc')).toThrow('Malformed');
  });

  it('produces deterministic blind indexes that differ per key', () => {
    const a = new EnvKeyProvider(keyA, hmacA);
    const b = new EnvKeyProvider(keyA, hmacB);

    expect(a.blindIndex('9876543210')).toBe(a.blindIndex('9876543210'));
    expect(a.blindIndex('9876543210')).toMatch(/^[0-9a-f]{64}$/);
    expect(a.blindIndex('9876543210')).not.toBe(b.blindIndex('9876543210'));
    expect(a.blindIndex('9876543210')).not.toBe(a.blindIndex('9876543211'));
  });

  it('refuses keys of the wrong length and builds from env', () => {
    expect(() => new EnvKeyProvider(randomBytes(16), hmacA)).toThrow(AppError);
    expect(() => new EnvKeyProvider(keyA, randomBytes(31))).toThrow(AppError);
    const fromEnv = EnvKeyProvider.fromEnv({
      ENCRYPTION_KEY_B64: keyA.toString('base64'),
      BLIND_INDEX_KEY_B64: hmacA.toString('base64'),
    });
    expect(fromEnv.decrypt(fromEnv.encrypt('x'))).toBe('x');
  });
});
