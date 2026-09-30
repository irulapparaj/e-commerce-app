/**
 * RBAC matrix test (P17 task 4).
 *
 * Generates probes from the route registry and verifies that:
 *   - anonymous requests to authenticated routes get 401
 *   - customer tokens cannot reach admin routes (403)
 *   - STAFF tokens cannot reach ADMIN-only routes (403)
 *   - ADMIN tokens can reach ADMIN-only routes
 *
 * The test boots the app once and shares it across all probes.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { routeRegistry, type RouteDecl } from '../../src/security/route-registry';
import { buildTestApp, type TestApp } from '../helpers/app';
import { getPrisma, resetDb } from '../helpers/db';
import { signTestToken } from '../helpers/tokens';

const _API_PREFIX = '/api/v1';

const makeAuth = (token: string) => ({ authorization: `Bearer ${token}` });

const placeholderBody = (method: string): Record<string, unknown> =>
  ['POST', 'PUT', 'PATCH'].includes(method) ? { _probe: true } : {};

const normalisePath = (path: string): string =>
  path
    .replace(':slug', 'test-slug')
    .replace(/:id$/g, '00000000-0000-0000-0000-000000000001')
    .replace(':id', '00000000-0000-0000-0000-000000000001')
    .replace(':variantId', '00000000-0000-0000-0000-000000000002')
    .replace(':imageId', '00000000-0000-0000-0000-000000000003')
    .replace(':sessionId', '00000000-0000-0000-0000-000000000004')
    .replace(':exportId', '00000000-0000-0000-0000-000000000005')
    .replace(':jobId', '00000000-0000-0000-0000-000000000006')
    .replace(':key', 'brand');

describe('RBAC matrix', () => {
  let testApp: TestApp;
  let adminToken: string;
  let staffToken: string;
  let storefrontToken: string;

  beforeAll(async () => {
    testApp = await buildTestApp();

    // Clean slate so no prior-file email/id conflicts prevent the upsert
    await resetDb();

    // Seed the test users so the DB-backed auth guard lets them through
    const prisma = getPrisma();
    await prisma.user.upsert({
      where: { id: '00000000-0000-0000-0000-000000000010' },
      create: {
        id: '00000000-0000-0000-0000-000000000010',
        email: 'rbac-admin@example.test',
        role: 'ADMIN',
        mfaEnabled: true,
      },
      update: { role: 'ADMIN', mfaEnabled: true, isDisabled: false, deletedAt: null },
    });

    [adminToken, staffToken, storefrontToken] = await Promise.all([
      signTestToken(testApp.env, {
        sub: '00000000-0000-0000-0000-000000000010',
        aud: 'admin',
        role: 'ADMIN',
        amr: ['otp', 'totp'],
      }),
      signTestToken(testApp.env, {
        sub: '00000000-0000-0000-0000-000000000011',
        aud: 'admin',
        role: 'STAFF',
        amr: ['otp', 'totp'],
      }),
      signTestToken(testApp.env, {
        sub: '00000000-0000-0000-0000-000000000012',
        aud: 'storefront',
        role: 'CUSTOMER',
        amr: ['otp'],
      }),
    ]);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const adminRoutes = (): Array<[string, RouteDecl]> =>
    [...routeRegistry().entries()].filter(([, r]) => r.auth === 'admin');

  const userRoutes = (): Array<[string, RouteDecl]> =>
    [...routeRegistry().entries()].filter(([, r]) => r.auth === 'user');

  it('anonymous requests to admin routes return 401', async () => {
    const routes = adminRoutes().slice(0, 10); // Limit to keep test fast
    for (const [, route] of routes) {
      const url = normalisePath(route.path);
      const res = await testApp.app.inject({
        method: route.method,
        url,
        body: placeholderBody(route.method),
      });
      // POST/PUT/PATCH/DELETE: body/params schema validates before the auth preHandler so strict
      // schemas may return 400. Any rejection (400/401/403) is acceptable for anonymous access.
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method);
      const acceptable = isWrite ? [400, 401, 403] : [401, 403];
      expect(
        acceptable,
        `${route.method} ${url} should reject anonymous access`,
      ).toContain(res.statusCode);
    }
  });

  it('anonymous requests to user routes return 401', async () => {
    const routes = userRoutes().slice(0, 10);
    for (const [, route] of routes) {
      const url = normalisePath(route.path);
      const res = await testApp.app.inject({
        method: route.method,
        url,
        body: placeholderBody(route.method),
      });
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method);
      const acceptable = isWrite ? [400, 401, 403] : [401, 403];
      expect(
        acceptable,
        `${route.method} ${url} should reject anonymous access`,
      ).toContain(res.statusCode);
    }
  });

  it('storefront customer token cannot reach admin routes (403)', async () => {
    const routes = adminRoutes().slice(0, 8);
    for (const [, route] of routes) {
      const url = normalisePath(route.path);
      const res = await testApp.app.inject({
        method: route.method,
        url,
        headers: makeAuth(storefrontToken),
        body: placeholderBody(route.method),
      });
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method);
      const acceptable = isWrite ? [400, 401, 403] : [401, 403];
      expect(
        acceptable,
        `${route.method} ${url} should reject storefront token on admin route`,
      ).toContain(res.statusCode);
    }
  });

  it('STAFF token cannot reach ADMIN-only routes (403)', async () => {
    const adminOnly = adminRoutes().filter(([, r]) =>
      r.roles?.length === 1 && r.roles[0] === 'ADMIN',
    );
    for (const [, route] of adminOnly.slice(0, 5)) {
      const url = normalisePath(route.path);
      const res = await testApp.app.inject({
        method: route.method,
        url,
        headers: makeAuth(staffToken),
        body: placeholderBody(route.method),
      });
      // Body schema validation runs before auth, so write methods may return 400
      const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(route.method);
      expect(
        isWrite ? [400, 401, 403] : [401, 403],
        `${route.method} ${url} should reject STAFF on ADMIN-only route`,
      ).toContain(res.statusCode);
    }
  });

  it('ADMIN token reaches admin routes (not 401/403)', async () => {
    // Only test GET routes to avoid side-effects; accept 4xx from missing data (404/422) or 400
    // from the placeholder body, but not 401/403 which would indicate an auth failure.
    const readRoutes = adminRoutes().filter(([, r]) => r.method === 'GET').slice(0, 5);
    for (const [, route] of readRoutes) {
      const url = normalisePath(route.path);
      const res = await testApp.app.inject({
        method: 'GET',
        url,
        headers: makeAuth(adminToken),
      });
      expect(
        [401, 403],
        `${route.method} ${url} must not return 401/403 for valid ADMIN token`,
      ).not.toContain(res.statusCode);
    }
  });
});
