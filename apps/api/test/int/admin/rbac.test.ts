import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ADMIN_POLICIES, type AdminPolicyName } from '../../../src/modules/admin/policies';
import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory, createProduct, doc } from '../../helpers/catalogue';
import { createCustomer } from '../../helpers/customers';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs } from '../../helpers/jobs';

interface Fixture {
  readonly productId: string;
  readonly variantId: string;
  readonly imageId: string;
  readonly categoryId: string;
  readonly childCategoryId: string;
  readonly emptyCategoryId: string;
  readonly targetStaffId: string;
  readonly staffSessionId: string;
  readonly imageKey: string;
  readonly importJobId: string;
  readonly customerId: string;
  readonly customerSessionId: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RouteCase {
  readonly policy: AdminPolicyName;
  readonly method: Method;
  readonly url: (f: Fixture) => string;
  readonly payload?: (f: Fixture) => object;
  /** A status the allowed variant may legitimately answer besides success (never 403). */
  readonly tolerated?: number;
}

const content = {
  name: 'RBAC Product',
  sku: 'RBAC-1',
  description: doc('x'),
  specifications: {},
  howToUse: null,
  tags: [],
};

/** Every admin route of P05/P06 mapped to its §8.1 policy (P05 §6, P06 §5). */
const ROUTES: readonly RouteCase[] = [
  { policy: 'settings.read', method: 'GET', url: () => '/admin/settings' },
  {
    policy: 'settings.write',
    method: 'PUT',
    url: () => '/admin/settings/return_window_days',
    payload: () => ({ value: 14 }),
  },
  { policy: 'staff.read', method: 'GET', url: () => '/admin/staff' },
  {
    policy: 'staff.write',
    method: 'POST',
    url: () => '/admin/staff',
    payload: () => ({ email: `invite-${Date.now()}@example.test`, name: 'New', role: 'STAFF' }),
  },
  {
    policy: 'staff.write',
    method: 'POST',
    url: (f) => `/admin/staff/${f.targetStaffId}/role`,
    payload: () => ({ role: 'ADMIN' }),
  },
  {
    policy: 'staff.write',
    method: 'POST',
    url: (f) => `/admin/staff/${f.targetStaffId}/revoke-sessions`,
  },
  {
    policy: 'staff.write',
    method: 'POST',
    url: (f) => `/admin/staff/${f.targetStaffId}/mfa-reset`,
  },
  { policy: 'audit.read', method: 'GET', url: () => '/admin/audit' },
  { policy: 'security.read', method: 'GET', url: () => '/admin/security' },
  {
    policy: 'security.write',
    method: 'POST',
    url: (f) => `/admin/security/sessions/${f.staffSessionId}/revoke`,
  },
  { policy: 'stats.read', method: 'GET', url: () => '/admin/stats' },
  { policy: 'products.read', method: 'GET', url: () => '/admin/products' },
  { policy: 'products.read', method: 'GET', url: (f) => `/admin/products/${f.productId}` },
  {
    policy: 'products.content',
    method: 'POST',
    url: () => '/admin/products',
    payload: (f) => ({ ...content, sku: `RBAC-${Date.now()}`, categoryId: f.categoryId }),
  },
  {
    policy: 'products.content',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/content`,
    payload: () => ({ name: 'Renamed' }),
  },
  {
    policy: 'products.commercial',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/commercial`,
    payload: () => ({ isFeatured: true }),
  },
  {
    policy: 'products.commercial',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/publish`,
    payload: () => ({ isActive: false }),
  },
  {
    policy: 'variants.content',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/variants/${f.variantId}`,
    payload: () => ({ label: 'Big' }),
  },
  {
    policy: 'variants.price',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/variants/${f.variantId}/price`,
    payload: () => ({ price: 12000, compareAtPrice: null }),
  },
  {
    policy: 'variants.price',
    method: 'POST',
    url: (f) => `/admin/products/${f.productId}/variants`,
    payload: () => ({
      sku: `RBAC-V-${Date.now()}`,
      label: 'Extra',
      weightGrams: 10,
      isDefault: false,
      lowStockThreshold: 1,
      price: 500,
      compareAtPrice: null,
    }),
  },
  {
    policy: 'images.write',
    method: 'POST',
    url: (f) => `/admin/products/${f.productId}/images/presign`,
    payload: () => ({ contentType: 'image/png', contentLength: 100 }),
  },
  {
    policy: 'images.write',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/images/order`,
    payload: (f) => ({ orderedIds: [f.imageId] }),
  },
  {
    policy: 'images.write',
    method: 'PATCH',
    url: (f) => `/admin/products/${f.productId}/images/${f.imageId}`,
    payload: () => ({ alt: 'Alt' }),
  },
  {
    policy: 'images.write',
    method: 'POST',
    url: (f) => `/admin/products/${f.productId}/images/confirm`,
    payload: (f) => ({ key: f.imageKey, alt: '' }),
  },
  {
    policy: 'jobs.read',
    method: 'GET',
    url: () => '/admin/jobs/00000000-0000-4000-8000-000000000000',
  },
  { policy: 'categories.read', method: 'GET', url: () => '/admin/categories' },
  {
    policy: 'categories.write',
    method: 'POST',
    url: () => '/admin/categories',
    payload: () => ({
      name: `Cat ${Date.now()}`,
      parentId: null,
      metaTitle: null,
      metaDescription: null,
    }),
  },
  {
    policy: 'categories.write',
    method: 'PUT',
    url: (f) => `/admin/categories/${f.childCategoryId}`,
    payload: (f) => ({
      name: 'Renamed child',
      parentId: f.categoryId,
      metaTitle: null,
      metaDescription: null,
    }),
  },
  {
    policy: 'categories.write',
    method: 'PATCH',
    url: () => '/admin/categories/reorder',
    payload: (f) => ({ orderedIds: [f.childCategoryId] }),
  },
  {
    policy: 'categories.write',
    method: 'POST',
    url: (f) => `/admin/categories/${f.categoryId}/image/presign`,
    payload: () => ({ contentType: 'image/webp', contentLength: 100 }),
  },
  { policy: 'inventory.read', method: 'GET', url: () => '/admin/inventory' },
  { policy: 'inventory.read', method: 'GET', url: () => '/admin/inventory/low-stock' },
  { policy: 'inventory.read', method: 'GET', url: () => '/admin/inventory/movements' },
  {
    policy: 'inventory.adjust',
    method: 'POST',
    url: (f) => `/admin/inventory/${f.variantId}/adjust`,
    payload: () => ({ delta: 1, note: 'small adjustment' }),
  },
  {
    policy: 'inventory.adjust_large',
    method: 'POST',
    url: (f) => `/admin/inventory/${f.variantId}/adjust`,
    payload: () => ({ delta: 101, note: 'large adjustment' }),
  },
  { policy: 'inventory.ledger_check', method: 'POST', url: () => '/admin/inventory/ledger-check' },
  {
    policy: 'images.write',
    method: 'DELETE',
    url: (f) => `/admin/products/${f.productId}/images/${f.imageId}`,
  },
  {
    policy: 'variants.price',
    method: 'DELETE',
    url: (f) => `/admin/products/${f.productId}/variants/${f.variantId}`,
  },
  { policy: 'products.commercial', method: 'DELETE', url: (f) => `/admin/products/${f.productId}` },
  { policy: 'imports.read', method: 'GET', url: () => '/admin/import' },
  { policy: 'imports.read', method: 'GET', url: () => '/admin/import/template?format=csv' },
  { policy: 'imports.read', method: 'GET', url: (f) => `/admin/import/${f.importJobId}` },
  { policy: 'imports.read', method: 'GET', url: (f) => `/admin/import/${f.importJobId}/errors` },
  {
    policy: 'imports.write',
    method: 'POST',
    url: () => '/admin/import',
    payload: () => ({ contentType: 'text/csv', contentLength: 100 }),
  },
  {
    policy: 'imports.write',
    method: 'POST',
    url: (f) => `/admin/import/${f.importJobId}/validate`,
  },
  { policy: 'imports.apply', method: 'POST', url: (f) => `/admin/import/${f.importJobId}/apply` },
  { policy: 'exports.products', method: 'POST', url: () => '/admin/export/products' },
  {
    policy: 'exports.sensitive',
    method: 'POST',
    url: () => '/admin/export/orders',
    payload: () => ({ full: false }),
  },
  {
    policy: 'exports.sensitive',
    method: 'POST',
    url: () => '/admin/export/customers',
    payload: () => ({ full: false }),
  },
  {
    policy: 'exports.read',
    method: 'GET',
    url: () => '/admin/export/00000000-0000-4000-8000-000000000000',
  },
  { policy: 'customers.read', method: 'GET', url: () => '/admin/customers?q=cust' },
  { policy: 'customers.read', method: 'GET', url: (f) => `/admin/customers/${f.customerId}` },
  {
    policy: 'customers.read',
    method: 'GET',
    url: (f) => `/admin/customers/${f.customerId}/sessions`,
  },
  {
    policy: 'customers.reveal',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/reveal`,
    payload: () => ({ reason: 'RBAC matrix reveal check' }),
  },
  {
    policy: 'customers.pii',
    method: 'GET',
    url: (f) => `/admin/customers/${f.customerId}/pii`,
    /** No reveal token: the allowed variant answers 401 REVEAL_EXPIRED, which the matrix tolerates below. */
    tolerated: 401,
  },
  {
    policy: 'customers.sessions_revoke',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/sessions/${f.customerSessionId}/revoke`,
  },
  {
    policy: 'customers.dpdp_export',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/dpdp-export`,
  },
  {
    policy: 'customers.disable',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/disable`,
    payload: () => ({ reason: 'RBAC matrix disable check' }),
  },
  {
    policy: 'customers.enable',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/enable`,
  },
  {
    policy: 'customers.erase',
    method: 'POST',
    url: (f) => `/admin/customers/${f.customerId}/dpdp-erase`,
    payload: () => ({ reason: 'RBAC matrix erase check' }),
  },
  {
    policy: 'categories.write',
    method: 'DELETE',
    url: (f) => `/admin/categories/${f.emptyCategoryId}`,
  },
];

describe('admin RBAC matrix (DESIGN §8.1 via ADMIN_POLICIES)', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;
  let fixture: Fixture;

  beforeAll(async () => {
    testApp = await buildTestApp();
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    await seedMinimal(getPrisma());
    ({ admin, staff } = await loginAdminAndStaff(testApp));
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    const prisma = getPrisma();
    const category = await createCategory(testApp, `Root ${Date.now()}`);
    const child = await createCategory(testApp, 'Child', category.id);
    const empty = await createCategory(testApp, `Empty ${Date.now()}`);
    const product = await createProduct(testApp, {
      name: `Fixture ${Date.now()}`,
      categoryId: category.id,
      stock: 0,
      active: false,
    });
    const targetStaff = await prisma.user.upsert({
      where: { email: 'target@example.test' },
      create: { email: 'target@example.test', role: 'STAFF', mfaEnabled: true },
      update: { role: 'STAFF', mfaEnabled: true },
    });
    const importJob = await prisma.importJob.create({
      data: { actorId: admin.userId, fileKey: `imports/rbac-${Date.now()}.csv` },
    });
    const customer = await createCustomer(testApp, `rbac-customer-${Date.now()}@example.test`);
    fixture = {
      importJobId: importJob.id,
      customerId: customer.id,
      customerSessionId: customer.session.sessionId,
      productId: product.id,
      variantId: product.variants[0]!.id,
      imageId: product.images[0]!.id,
      categoryId: category.id,
      childCategoryId: child.id,
      emptyCategoryId: empty.id,
      targetStaffId: targetStaff.id,
      staffSessionId: staff.sessionId,
      imageKey: `products/${product.id}/00000000-0000-4000-8000-000000000000.png`,
    };
  });

  const expectation = (
    policy: AdminPolicyName,
    role: 'STAFF' | 'ADMIN',
    steppedUp: boolean,
  ): { allowed: boolean; code?: string } => {
    const rule = ADMIN_POLICIES[policy];
    if (!(rule.roles as readonly string[]).includes(role))
      return { allowed: false, code: 'FORBIDDEN' };
    if (rule.stepUp && !steppedUp) return { allowed: false, code: 'STEP_UP_REQUIRED' };
    return { allowed: true };
  };

  it.each(
    ROUTES.map(
      (route) =>
        [
          `${route.method} ${route.url({ productId: ':id', variantId: ':variantId', imageId: ':imageId', categoryId: ':categoryId', childCategoryId: ':childId', emptyCategoryId: ':emptyId', targetStaffId: ':staffId', staffSessionId: ':sessionId', imageKey: 'key', importJobId: ':importId', customerId: ':customerId', customerSessionId: ':customerSessionId' })} → ${route.policy}`,
          route,
        ] as const,
    ),
  )('%s', async (_label, route) => {
    const variants: readonly [AdminSession, string, 'STAFF' | 'ADMIN', boolean][] = [
      [staff, staff.token, 'STAFF', false],
      [staff, staff.steppedToken, 'STAFF', true],
      [admin, admin.token, 'ADMIN', false],
      [admin, admin.steppedToken, 'ADMIN', true],
    ];
    for (const [, token, role, steppedUp] of variants) {
      const res = await adminInject(
        testApp,
        token,
        route.method,
        route.url(fixture),
        route.payload?.(fixture),
      );
      const expected = expectation(route.policy, role, steppedUp);
      const label = `${role}${steppedUp ? '+step-up' : ''} ${route.method} ${route.url(fixture)} → ${res.statusCode} ${res.body.slice(0, 120)}`;
      if (expected.allowed) {
        expect(
          [401, 403].filter((status) => status !== route.tolerated),
          label,
        ).not.toContain(res.statusCode);
      } else {
        expect(res.statusCode, label).toBe(403);
        expect(body(res).error?.code, label).toBe(expected.code);
      }
    }
  });

  it('rejects customers, mfa-audience tokens and anonymous callers on every admin route', async () => {
    const customerToken = await testApp.app.auth.tokens.signAccess({
      sub: admin.userId,
      role: 'ADMIN',
      aud: 'storefront',
    });
    const mfaToken = await testApp.app.auth.tokens.signAccess({
      sub: admin.userId,
      role: 'ADMIN',
      aud: 'mfa',
    });
    for (const route of ROUTES.filter((candidate) => candidate.method === 'GET')) {
      const anonymous = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1${route.url(fixture)}`,
      });
      const storefront = await adminInject(testApp, customerToken, 'GET', route.url(fixture));
      const mfa = await adminInject(testApp, mfaToken, 'GET', route.url(fixture));
      expect(anonymous.statusCode, route.url(fixture)).toBe(401);
      expect(storefront.statusCode, route.url(fixture)).toBe(401);
      expect(mfa.statusCode, route.url(fixture)).toBe(401);
    }
  });

  it('returns 400 (not 500) for non-UUID ids', async () => {
    const cases: readonly [Method, string, object?][] = [
      ['GET', '/admin/products/not-a-uuid'],
      ['DELETE', '/admin/categories/1'],
      ['GET', '/admin/jobs/abc'],
      ['POST', '/admin/inventory/x/adjust', { delta: 1, note: 'nope nope' }],
      ['POST', '/admin/staff/12345/role', { role: 'STAFF' }],
    ];
    for (const [method, url, payload] of cases) {
      const res = await adminInject(testApp, admin.steppedToken, method, url, payload);
      expect(res.statusCode, url).toBe(400);
    }
  });
});
