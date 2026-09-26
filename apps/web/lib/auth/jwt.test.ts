import { createPrivateKey } from 'node:crypto';

import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { TEST_ISSUER, TEST_KID, TEST_PRIVATE_PEM, TEST_PUBLIC_PEM } from '../../test-setup';

import { verifyAccessToken } from './jwt';

const KEYS = [{ kid: TEST_KID, publicPem: TEST_PUBLIC_PEM }];
const USER = '0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d';

const sign = (
  claims: Record<string, unknown>,
  options: { kid?: string; exp?: string; issuer?: string } = {},
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: options.kid ?? TEST_KID })
    .setSubject(USER)
    .setAudience('storefront')
    .setIssuer(options.issuer ?? TEST_ISSUER)
    .setIssuedAt()
    .setExpirationTime(options.exp ?? '15m')
    .setJti('j')
    .sign(createPrivateKey(TEST_PRIVATE_PEM));

describe('verifyAccessToken', () => {
  it('verifies a token locally and exposes the session claims', async () => {
    const token = await sign({ role: 'ADMIN', amr: ['step-up'], stepUpExp: 123 });

    const session = await verifyAccessToken(token, KEYS, TEST_ISSUER);

    expect(session).toMatchObject({
      userId: USER,
      role: 'ADMIN',
      aud: 'storefront',
      amr: ['step-up'],
      stepUpExp: 123,
    });
    expect(session?.exp).toBeGreaterThan(Date.now() / 1000);
  });

  it('returns null for missing, tampered, expired, wrong-issuer or unknown-kid tokens', async () => {
    const token = await sign({ role: 'CUSTOMER' });
    const [h, p, s] = token.split('.') as [string, string, string];

    expect(await verifyAccessToken(undefined, KEYS, TEST_ISSUER)).toBeNull();
    expect(await verifyAccessToken('', KEYS, TEST_ISSUER)).toBeNull();
    expect(await verifyAccessToken(`${h}.${p}.${s.slice(0, -3)}abc`, KEYS, TEST_ISSUER)).toBeNull();
    expect(
      await verifyAccessToken(await sign({ role: 'CUSTOMER' }, { exp: '-1s' }), KEYS, TEST_ISSUER),
    ).toBeNull();
    expect(
      await verifyAccessToken(
        await sign({ role: 'CUSTOMER' }, { issuer: 'other' }),
        KEYS,
        TEST_ISSUER,
      ),
    ).toBeNull();
    expect(
      await verifyAccessToken(await sign({ role: 'CUSTOMER' }, { kid: 'nope' }), KEYS, TEST_ISSUER),
    ).toBeNull();
    expect(await verifyAccessToken(await sign({ role: 'ROOT' }), KEYS, TEST_ISSUER)).toBeNull();
    expect(await verifyAccessToken(await sign({}), KEYS, TEST_ISSUER)).toBeNull();
  });
});
