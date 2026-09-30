import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it('returns false when TRUSTED_PROXIES is unset or blank', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('   ')).toBe(false);
  });

  it('returns a hop-trusting function for integer values', () => {
    const trustOne = parseTrustProxy('1');
    expect(typeof trustOne).toBe('function');
    if (typeof trustOne !== 'function') throw new Error('expected function');
    expect(trustOne('10.0.0.1', 0)).toBe(true);
    expect(trustOne('10.0.0.1', 1)).toBe(false);

    const trustTwo = parseTrustProxy(' 2 ');
    if (typeof trustTwo !== 'function') throw new Error('expected function');
    expect(trustTwo('10.0.0.1', 1)).toBe(true);
    expect(trustTwo('10.0.0.1', 2)).toBe(false);
  });

  it('returns an allowlist for comma-separated addresses and CIDR ranges', () => {
    expect(parseTrustProxy('10.0.0.1')).toEqual(['10.0.0.1']);
    expect(parseTrustProxy('10.0.0.1, 172.16.0.0/12,')).toEqual(['10.0.0.1', '172.16.0.0/12']);
  });
});

describe('request.ip under the derived trustProxy setting', () => {
  const buildEchoApp = async (trustedProxies: string | undefined) => {
    const app = Fastify({
      trustProxy: parseTrustProxy(trustedProxies) as
        | boolean
        | string[]
        | ((address: string, hop: number) => boolean),
    });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    await app.ready();
    return app;
  };

  it('ignores a spoofed X-Forwarded-For when no proxies are trusted (C-3)', async () => {
    const app = await buildEchoApp(undefined);
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '203.0.113.9',
      headers: { 'x-forwarded-for': '198.51.100.77' },
    });
    expect(res.json()).toEqual({ ip: '203.0.113.9' });
    await app.close();
  });

  it('resolves the client IP through a declared proxy and stops at untrusted hops', async () => {
    const app = await buildEchoApp('203.0.113.9');
    const res = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: '203.0.113.9',
      // Left-most entry is attacker-supplied; the walk stops at the first untrusted address.
      headers: { 'x-forwarded-for': '198.51.100.77, 192.0.2.10' },
    });
    expect(res.json()).toEqual({ ip: '192.0.2.10' });
    await app.close();
  });
});
