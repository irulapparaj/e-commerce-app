import { importPKCS8, SignJWT } from 'jose';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import middleware from './middleware';
import { TEST_ISSUER, TEST_KID, TEST_PRIVATE_PEM } from './test-setup';

const signAdminToken = async (): Promise<string> => {
  const key = await importPKCS8(TEST_PRIVATE_PEM, 'RS256');
  return new SignJWT({ role: 'ADMIN', amr: ['otp', 'totp'] })
    .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
    .setSubject('admin-1')
    .setAudience('admin')
    .setIssuer(TEST_ISSUER)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
};

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  });

describe('middleware security headers', () => {
  it('sets the admin CSP without Razorpay origins on /admin/login and forwards the nonce', async () => {
    const res = await middleware(request('/admin/login'));
    const csp = res.headers.get('content-security-policy') ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(res.status).toBe(200);
    expect(csp).not.toContain('razorpay');
    expect(nonce).toBeDefined();
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('strict-transport-security')).toContain('preload');
  });

  it('redirects anonymous /admin visits to the login page and still sets the headers', async () => {
    const res = await middleware(request('/admin/settings'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/login');
    expect(res.headers.get('content-security-policy')).not.toContain('razorpay');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('lets an admin session through and forwards the nonce header to the layout', async () => {
    const res = await middleware(request('/admin', `__Host-access=${await signAdminToken()}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });

  it('gives storefront pages the Razorpay CSP through the intl middleware', async () => {
    const res = await middleware(request('/'));
    const csp = res.headers.get('content-security-policy') ?? '';

    expect(csp).toContain('https://checkout.razorpay.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeTruthy();
  });

  it('redirects anonymous checkout visits to /login with a validated redirect and headers', async () => {
    const res = await middleware(request('/checkout'));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?redirect=%2Fcheckout');
    expect(res.headers.get('content-security-policy')).toContain('checkout.razorpay.com');
  });

  it('uses a fresh nonce per request', async () => {
    const [a, b] = await Promise.all([
      middleware(request('/admin/login')),
      middleware(request('/admin/login')),
    ]);

    expect(a.headers.get('x-middleware-request-x-nonce')).not.toBe(
      b.headers.get('x-middleware-request-x-nonce'),
    );
  });
});
