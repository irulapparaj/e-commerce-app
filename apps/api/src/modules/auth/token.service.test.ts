import { createHmac } from 'node:crypto';

import { AppError } from '@pe/shared';
import { describe, expect, it } from 'vitest';

import { testKeyPairs } from '../../../test/helpers/keys';

import { ACCESS_TTL_SECONDS, createTokenService } from './token.service';

const [k1, k2] = testKeyPairs() as [
  ReturnType<typeof testKeyPairs>[number],
  ReturnType<typeof testKeyPairs>[number],
];
const USER_ID = '0b8f7d1e-5f9c-4c9e-9d2a-3f6e6a1b2c3d';
const base64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

const service = (
  now = () => new Date('2026-09-25T10:00:00Z'),
  keys = [k1, k2],
  activeKid = k1.kid,
) => createTokenService({ keys, activeKid, issuer: 'test-issuer', now });

describe('token service', () => {
  it('signs and verifies an access token with kid, aud, jti and the audience TTL', async () => {
    const now = new Date('2026-09-25T10:00:00Z');
    const tokens = service(() => now);

    const token = await tokens.signAccess({ sub: USER_ID, role: 'CUSTOMER', aud: 'storefront' });
    const claims = await tokens.verifyAccess(token, { audience: 'storefront' });
    const header = JSON.parse(Buffer.from(token.split('.')[0] ?? '', 'base64url').toString()) as {
      alg: string;
      kid: string;
    };

    expect(header).toEqual({ alg: 'RS256', kid: k1.kid });
    expect(claims).toMatchObject({ sub: USER_ID, role: 'CUSTOMER', aud: 'storefront' });
    expect(claims.exp - claims.iat).toBe(ACCESS_TTL_SECONDS.storefront);
    expect(claims.jti).toMatch(/[0-9a-f-]{36}/);
  });

  it('uses the 5 minute TTL for mfa tokens and carries amr and stepUpExp', async () => {
    const tokens = service();

    const mfa = await tokens.verifyAccess(
      await tokens.signAccess({ sub: USER_ID, role: 'ADMIN', aud: 'mfa' }),
      { audience: 'mfa' },
    );
    const stepped = await tokens.verifyAccess(
      await tokens.signAccess({
        sub: USER_ID,
        role: 'ADMIN',
        aud: 'admin',
        amr: ['step-up'],
        stepUpExp: 1_800_000_000,
      }),
      { audience: 'admin' },
    );

    expect(mfa.exp - mfa.iat).toBe(ACCESS_TTL_SECONDS.mfa);
    expect(stepped.amr).toEqual(['step-up']);
    expect(stepped.stepUpExp).toBe(1_800_000_000);
  });

  it('rejects the wrong audience, expired tokens and tampered signatures', async () => {
    const tokens = service();
    const token = await tokens.signAccess({ sub: USER_ID, role: 'CUSTOMER', aud: 'storefront' });
    const later = service(() => new Date('2026-09-25T10:16:00Z'));
    const [h, p, s] = token.split('.') as [string, string, string];

    await expect(tokens.verifyAccess(token, { audience: 'admin' })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(tokens.verifyAccess(token, { audience: ['admin', 'mfa'] })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(later.verifyAccess(token, { audience: 'storefront' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      tokens.verifyAccess(`${h}.${p}.${s.slice(0, -4)}AAAA`, { audience: 'storefront' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      tokens.verifyAccess('not-a-jwt', { audience: 'storefront' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects an HS256 token signed with the public key as the secret (alg confusion)', async () => {
    const tokens = service();
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: k1.kid }));
    const payload = base64url(
      JSON.stringify({
        sub: USER_ID,
        role: 'ADMIN',
        aud: 'admin',
        iss: 'test-issuer',
        iat: now,
        exp: now + 900,
        jti: 'x',
      }),
    );
    const signature = createHmac('sha256', k1.publicPem)
      .update(`${header}.${payload}`)
      .digest('base64url');

    await expect(
      tokens.verifyAccess(`${header}.${payload}.${signature}`, { audience: 'admin' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rejects unknown or injected kids and tokens from a key outside the set', async () => {
    const tokens = service();
    const rogue = service(undefined, [k2], k2.kid);
    const token = await tokens.signAccess({ sub: USER_ID, role: 'CUSTOMER', aud: 'storefront' });
    const [, p, s] = token.split('.') as [string, string, string];
    const injected = `${base64url(JSON.stringify({ alg: 'RS256', kid: '../../etc/passwd' }))}.${p}.${s}`;
    const noKid = `${base64url(JSON.stringify({ alg: 'RS256' }))}.${p}.${s}`;
    const onlyK1 = service(undefined, [k1], k1.kid);

    await expect(tokens.verifyAccess(injected, { audience: 'storefront' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(tokens.verifyAccess(noKid, { audience: 'storefront' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(
      onlyK1.verifyAccess(
        await rogue.signAccess({ sub: USER_ID, role: 'CUSTOMER', aud: 'storefront' }),
        { audience: 'storefront' },
      ),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('verifies tokens signed by a previous key still in the set (rotation)', async () => {
    const signedWithK2 = service(undefined, [k1, k2], k2.kid);
    const verifier = service(undefined, [k1, k2], k1.kid);

    const token = await signedWithK2.signAccess({
      sub: USER_ID,
      role: 'CUSTOMER',
      aud: 'storefront',
    });

    await expect(verifier.verifyAccess(token, { audience: 'storefront' })).resolves.toMatchObject({
      sub: USER_ID,
    });
    expect(verifier.publicKeys.map((k) => k.kid)).toEqual([k1.kid, k2.kid]);
    expect(() => createTokenService({ keys: [k1], activeKid: 'missing', issuer: 'x' })).toThrow(
      'JWT_ACTIVE_KID',
    );
  });

  it('rejects malformed claims even with a valid signature', async () => {
    const tokens = service();
    const { SignJWT } = await import('jose');
    const { createPrivateKey } = await import('node:crypto');
    const token = await new SignJWT({ role: 'ROOT' })
      .setProtectedHeader({ alg: 'RS256', kid: k1.kid })
      .setSubject(USER_ID)
      .setAudience('storefront')
      .setIssuer('test-issuer')
      .setIssuedAt()
      .setExpirationTime('5m')
      .setJti('x')
      .sign(createPrivateKey(k1.privatePem));

    await expect(tokens.verifyAccess(token, { audience: 'storefront' })).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
});
