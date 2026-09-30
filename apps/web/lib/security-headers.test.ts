import { describe, expect, it } from 'vitest';

import { buildCsp, securityHeaders, surfaceForPath } from './security-headers';

const NONCE = 'dGVzdC1ub25jZQ==';

const directives = (csp: string): ReadonlyMap<string, string> =>
  new Map(
    csp.split('; ').map((part) => {
      const [name = '', ...sources] = part.split(' ');
      return [name, sources.join(' ')] as const;
    }),
  );

describe('buildCsp', () => {
  it('includes the Razorpay origins on the storefront only where DESIGN §11.3 lists them', () => {
    const csp = directives(buildCsp({ nonce: NONCE, surface: 'storefront' }));

    expect(csp.get('script-src')).toBe(`'self' 'nonce-${NONCE}' https://checkout.razorpay.com`);
    expect(csp.get('frame-src')).toBe('https://api.razorpay.com https://checkout.razorpay.com');
    expect(csp.get('connect-src')).toBe(
      "'self' https://api.razorpay.com https://lumberjack.razorpay.com",
    );
  });

  it('drops every Razorpay origin from the admin CSP', () => {
    const csp = buildCsp({ nonce: NONCE, surface: 'admin' });

    expect(csp).not.toContain('razorpay');
    expect(directives(csp).get('script-src')).toBe(`'self' 'nonce-${NONCE}'`);
    expect(directives(csp).get('frame-src')).toBe("'none'");
    expect(directives(csp).get('connect-src')).toBe("'self'");
  });

  it('lets the admin connect to the media origin for direct-to-bucket uploads', () => {
    const csp = directives(
      buildCsp({ nonce: NONCE, surface: 'admin', mediaOrigin: 'localhost:9000' }),
    );

    expect(csp.get('connect-src')).toBe("'self' http://localhost:9000 https://localhost:9000");
    expect(csp.get('img-src')).toBe("'self' data: http://localhost:9000 https://localhost:9000");
    expect(
      directives(
        buildCsp({ nonce: NONCE, surface: 'storefront', mediaOrigin: 'localhost:9000' }),
      ).get('connect-src'),
    ).toBe("'self' https://api.razorpay.com https://lumberjack.razorpay.com");
  });

  it('carries the shared hardening directives on both surfaces', () => {
    for (const surface of ['storefront', 'admin'] as const) {
      const csp = directives(buildCsp({ nonce: NONCE, surface }));

      expect(csp.get('default-src')).toBe("'self'");
      expect(csp.get('style-src')).toBe("'self' 'unsafe-inline' https://fonts.googleapis.com");
      expect(csp.get('font-src')).toBe("'self' https://fonts.gstatic.com");
      expect(csp.get('img-src')).toBe("'self' data:");
      expect(csp.get('object-src')).toBe("'none'");
      expect(csp.get('base-uri')).toBe("'self'");
      expect(csp.get('frame-ancestors')).toBe("'none'");
      expect(csp.get('form-action')).toBe("'self'");
      expect(csp.has('upgrade-insecure-requests')).toBe(true);
    }
  });

  it('allows the media host over http and https, or a full origin verbatim', () => {
    const host = directives(
      buildCsp({ nonce: NONCE, surface: 'admin', mediaOrigin: 'localhost:9000' }),
    );
    const origin = directives(
      buildCsp({ nonce: NONCE, surface: 'admin', mediaOrigin: 'https://cdn.example.com' }),
    );
    const empty = directives(buildCsp({ nonce: NONCE, surface: 'admin', mediaOrigin: '' }));

    expect(host.get('img-src')).toBe("'self' data: http://localhost:9000 https://localhost:9000");
    expect(origin.get('img-src')).toBe("'self' data: https://cdn.example.com");
    expect(empty.get('img-src')).toBe("'self' data:");
  });

  it('relaxes only the dev-bundler needs in development', () => {
    const csp = directives(buildCsp({ nonce: NONCE, surface: 'admin', isDevelopment: true }));

    expect(csp.get('script-src')).toBe(`'self' 'nonce-${NONCE}' 'unsafe-eval'`);
    expect(csp.has('upgrade-insecure-requests')).toBe(false);
  });
});

describe('securityHeaders', () => {
  it('returns the full §11.3 header set with HSTS preload in production', () => {
    const headers = securityHeaders('storefront', NONCE);

    expect(headers).toMatchObject({
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Frame-Options': 'DENY',
    });
    expect(headers['Content-Security-Policy']).toContain(`'nonce-${NONCE}'`);
    expect(headers['Content-Security-Policy']).toContain('checkout.razorpay.com');
  });

  it('omits HSTS in development and keeps the admin CSP Razorpay-free', () => {
    const headers = securityHeaders('admin', NONCE, { isDevelopment: true });

    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(headers['Content-Security-Policy']).not.toContain('razorpay');
  });
});

describe('surfaceForPath', () => {
  it('treats /admin and its children as the admin surface and everything else as storefront', () => {
    expect(surfaceForPath('/admin')).toBe('admin');
    expect(surfaceForPath('/admin/login')).toBe('admin');
    expect(surfaceForPath('/administration')).toBe('storefront');
    expect(surfaceForPath('/')).toBe('storefront');
    expect(surfaceForPath('/en/checkout')).toBe('storefront');
  });
});
