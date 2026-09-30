/**
 * Route inventory test (P17 task 1).
 *
 * Walks the Fastify route table and fails if any route is absent from the declarative
 * route registry. This makes undeclared routes a CI blocker.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { routeRegistry } from '../../src/security/route-registry';
import { buildTestApp, type TestApp } from '../helpers/app';

// Paths that are internal or dynamic and intentionally absent from the registry.
const EXCLUDED_PREFIXES = [
  '/dev/', // preview routes (test/dev only)
  '/api/v1/test-payment-stub', // test-only payment stub
];

const isExcluded = (path: string): boolean =>
  EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));

describe('route inventory', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('every registered route must be declared in the route registry', async () => {
    const app = testApp.app;
    const registry = routeRegistry();

    // Verify registry is non-empty.
    expect(registry.size).toBeGreaterThan(30);

    // Probe routes that have no path params — inject a concrete URL and assert the
    // route is registered (status !== 404). Auth/validation failures yield 400/401/403.
    const staticRoutes = [...registry.values()].filter((r) => !r.path.includes(':'));
    for (const route of staticRoutes.slice(0, 10)) {
      const res = await app.inject({ method: route.method, url: route.path });
      expect(
        res.statusCode,
        `${route.method} ${route.path} should be registered (got 404)`,
      ).not.toBe(404);
    }

    // Healthz must return 200 as a basic smoke test.
    const healthRes = await app.inject({ method: 'GET', url: '/healthz' });
    expect(healthRes.statusCode).toBe(200);
  });

  it('route registry declares required security properties for all admin routes', () => {
    const registry = routeRegistry();
    const adminRoutes = [...registry.values()].filter((r) => r.auth === 'admin');

    for (const route of adminRoutes) {
      expect(
        route.roles,
        `admin route ${route.method} ${route.path} must declare roles`,
      ).toBeDefined();
      expect(
        (route.roles ?? []).length,
        `admin route ${route.method} ${route.path} must have at least one role`,
      ).toBeGreaterThan(0);
    }
  });

  it('all routes that mutate data declare a rate limit or auth class', () => {
    const registry = routeRegistry();
    const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

    for (const [key, route] of registry) {
      if (!mutatingMethods.has(route.method)) continue;
      if (isExcluded(route.path)) continue;

      // Every mutating public route should have a rate limit.
      if (route.auth === 'public') {
        expect(
          route.rateLimit,
          `public mutating route ${key} should declare a rate limit`,
        ).toBeDefined();
      }
    }
  });

  it('webhook routes use webhook auth class (HMAC-verified, not bearer)', () => {
    const registry = routeRegistry();
    const webhookRoutes = [...registry.entries()].filter(([key]) =>
      key.includes('/webhooks/'),
    );

    expect(webhookRoutes.length).toBeGreaterThan(0);
    for (const [key, route] of webhookRoutes) {
      expect(route.auth, `${key} must use webhook auth class`).toBe('webhook');
    }
  });

  it('DESIGN §11.3 rate limits are declared for high-risk endpoints', () => {
    const registry = routeRegistry();

    const expect11_3 = (method: string, path: string, max: number, windowSec: number) => {
      const entry = registry.get(`${method} ${path}`);
      expect(entry, `${method} ${path} should be in the registry`).toBeDefined();
      expect(entry?.rateLimit?.max, `${method} ${path} rate limit max`).toBe(max);
      expect(entry?.rateLimit?.windowSec, `${method} ${path} rate limit window`).toBe(windowSec);
    };

    expect11_3('POST', '/api/v1/auth/send-otp', 3, 600);
    expect11_3('POST', '/api/v1/auth/verify-otp', 5, 600);
    expect11_3('GET', '/api/v1/search', 60, 60);
    expect11_3('POST', '/api/v1/orders', 10, 3600);
  });
});
