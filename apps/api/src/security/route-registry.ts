/**
 * Declarative per-route security metadata (P17 keystone).
 *
 * Every API route must call `declareRoute` with its security properties. The inventory test
 * walks `fastify.printRoutes()` and fails if any route is absent from this registry, so nothing
 * ships undeclared.
 *
 * Rate-limit values are cross-referenced against DESIGN §11.3. A snapshot test verifies they
 * have not drifted.
 */
import type { ZodType } from 'zod';

export type AuthClass = 'public' | 'webhook' | 'user' | 'admin';
export type Audience = 'storefront' | 'admin' | 'any';

export interface RateLimitDecl {
  readonly key: string;
  readonly max: number;
  readonly windowSec: number;
}

export interface RouteDecl {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly auth: AuthClass;
  /** Required roles (admin routes only). */
  readonly roles?: readonly ('ADMIN' | 'STAFF')[];
  /** ⚡ step-up TOTP required (admin routes). */
  readonly stepUp?: boolean;
  /** reauth (OTP re-verify) required (storefront mutation routes). */
  readonly reauth?: boolean;
  readonly audience?: Audience;
  readonly rateLimit?: RateLimitDecl;
  /** Zod schema key for the primary body / querystring (informational). */
  readonly schema?: ZodType | string;
}

const registry = new Map<string, RouteDecl>();

export const declareRoute = (decl: RouteDecl): void => {
  const key = `${decl.method} ${decl.path}`;
  registry.set(key, decl);
};

/** Returns all declared routes (read-only view). */
export const routeRegistry = (): ReadonlyMap<string, RouteDecl> => registry;

/** Returns the declaration for a specific method+path pair, or undefined if undeclared. */
export const getRouteDecl = (method: string, path: string): RouteDecl | undefined =>
  registry.get(`${method.toUpperCase()} ${path}`);

// ---------------------------------------------------------------------------
// Route declarations — ordered alphabetically within each auth class
// ---------------------------------------------------------------------------

// == PUBLIC ROUTES (no auth required) =======================================

declareRoute({ method: 'GET', path: '/healthz', auth: 'public' });
declareRoute({ method: 'GET', path: '/readyz', auth: 'public' });
declareRoute({ method: 'GET', path: '/metrics', auth: 'public' });

// Catalogue
declareRoute({ method: 'GET', path: '/api/v1/categories', auth: 'public' });
declareRoute({ method: 'GET', path: '/api/v1/categories/:slug/products', auth: 'public' });
declareRoute({ method: 'GET', path: '/api/v1/products', auth: 'public' });
declareRoute({ method: 'GET', path: '/api/v1/products/:slug', auth: 'public' });
declareRoute({
  method: 'GET',
  path: '/api/v1/search',
  auth: 'public',
  rateLimit: { key: 'search:ip', max: 60, windowSec: 60 },
});
declareRoute({ method: 'GET', path: '/api/v1/settings/public', auth: 'public' });
declareRoute({ method: 'GET', path: '/api/v1/sitemap-data', auth: 'public' });

// Auth — OTP flow (public endpoints with per-key rate limits)
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/send-otp',
  auth: 'public',
  rateLimit: { key: 'otp:send:email', max: 3, windowSec: 600 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/verify-otp',
  auth: 'public',
  rateLimit: { key: 'otp:verify', max: 5, windowSec: 600 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/refresh',
  auth: 'public',
  rateLimit: { key: 'auth:refresh:ip', max: 30, windowSec: 60 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/logout',
  auth: 'public',
  rateLimit: { key: 'auth:logout:ip', max: 30, windowSec: 60 },
});

// Reauth (storefront OTP re-verify before sensitive ops)
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/reauth/send',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'reauth:send', max: 3, windowSec: 600 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/auth/reauth/verify',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'reauth:verify', max: 5, windowSec: 600 },
});

// Forms (public contact / seller inquiry)
declareRoute({
  method: 'POST',
  path: '/api/v1/forms/contact',
  auth: 'public',
  rateLimit: { key: 'forms:contact:ip', max: 5, windowSec: 3600 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/forms/seller-inquiry',
  auth: 'public',
  rateLimit: { key: 'forms:seller:ip', max: 5, windowSec: 3600 },
});

// Newsletter
declareRoute({
  method: 'POST',
  path: '/api/v1/newsletter/subscribe',
  auth: 'public',
  rateLimit: { key: 'newsletter:sub:ip', max: 5, windowSec: 3600 },
});
declareRoute({ method: 'GET', path: '/api/v1/newsletter/unsubscribe', auth: 'public' });

// Shipping serviceability (public — no auth required, but rate-limited)
declareRoute({
  method: 'GET',
  path: '/api/v1/shipping/serviceability',
  auth: 'public',
  rateLimit: { key: 'shipping:svc:ip', max: 30, windowSec: 60 },
});

// == WEBHOOK ROUTES (HMAC-verified, no bearer) ==============================

declareRoute({ method: 'POST', path: '/api/v1/webhooks/razorpay', auth: 'webhook' });
declareRoute({ method: 'POST', path: '/api/v1/webhooks/email', auth: 'webhook' });
declareRoute({ method: 'POST', path: '/api/v1/webhooks/shiprocket', auth: 'webhook' });

// == USER ROUTES (bearer required, storefront or admin audience) ============

// Session / auth
declareRoute({ method: 'POST', path: '/api/v1/auth/logout-all', auth: 'user', audience: 'any' });
declareRoute({ method: 'GET', path: '/api/v1/auth/me', auth: 'user', audience: 'any' });
declareRoute({ method: 'GET', path: '/api/v1/account/sessions', auth: 'user', audience: 'any' });
declareRoute({
  method: 'DELETE',
  path: '/api/v1/account/sessions/:id',
  auth: 'user',
  audience: 'any',
});

// MFA enrolment (user must have admin/staff role in practice, but bearer is user class)
declareRoute({ method: 'POST', path: '/api/v1/auth/mfa/enrol', auth: 'user', audience: 'any' });
declareRoute({ method: 'POST', path: '/api/v1/auth/step-up', auth: 'user', audience: 'admin' });

// Addresses (storefront)
declareRoute({ method: 'GET', path: '/api/v1/account/addresses', auth: 'user', audience: 'storefront' });
declareRoute({ method: 'POST', path: '/api/v1/account/addresses', auth: 'user', audience: 'storefront' });
declareRoute({ method: 'PUT', path: '/api/v1/account/addresses/:id', auth: 'user', audience: 'storefront' });
declareRoute({ method: 'DELETE', path: '/api/v1/account/addresses/:id', auth: 'user', audience: 'storefront' });
declareRoute({ method: 'POST', path: '/api/v1/account/addresses/:id/default', auth: 'user', audience: 'storefront' });

// Account (storefront)
declareRoute({ method: 'PATCH', path: '/api/v1/account/profile', auth: 'user', audience: 'storefront' });
declareRoute({
  method: 'POST',
  path: '/api/v1/account/export',
  auth: 'user',
  audience: 'storefront',
  reauth: true,
  rateLimit: { key: 'account:export', max: 1, windowSec: 86400 },
});
declareRoute({ method: 'DELETE', path: '/api/v1/account', auth: 'user', audience: 'storefront', reauth: true });

// Cart (storefront)
declareRoute({
  method: 'GET',
  path: '/api/v1/cart',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/cart/items',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});
declareRoute({
  method: 'PUT',
  path: '/api/v1/cart/items/:variantId',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});
declareRoute({
  method: 'DELETE',
  path: '/api/v1/cart/items/:variantId',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/cart/coupon',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});
declareRoute({
  method: 'DELETE',
  path: '/api/v1/cart/coupon',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'cart:session', max: 120, windowSec: 60 },
});

// Orders (storefront)
declareRoute({
  method: 'POST',
  path: '/api/v1/orders',
  auth: 'user',
  audience: 'storefront',
  rateLimit: { key: 'orders:create:user', max: 10, windowSec: 3600 },
});
declareRoute({
  method: 'POST',
  path: '/api/v1/orders/:id/verify-payment',
  auth: 'user',
  audience: 'storefront',
});
declareRoute({ method: 'GET', path: '/api/v1/orders', auth: 'user', audience: 'storefront' });
declareRoute({ method: 'GET', path: '/api/v1/orders/:id', auth: 'user', audience: 'storefront' });

// == ADMIN ROUTES (bearer required, admin audience, RBAC enforced) ==========

// Categories
declareRoute({ method: 'GET', path: '/api/v1/admin/categories', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/categories', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'PUT', path: '/api/v1/admin/categories/:id', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'DELETE', path: '/api/v1/admin/categories/:id', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/categories/reorder', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/categories/:id/image/presign', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/categories/:id/image/confirm', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Products
declareRoute({ method: 'GET', path: '/api/v1/admin/products', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/products', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/products/:id', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'DELETE', path: '/api/v1/admin/products/:id', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/content', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/commercial', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/publish', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Variants
declareRoute({ method: 'POST', path: '/api/v1/admin/products/:id/variants', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/variants/:variantId', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/variants/:variantId/price', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'DELETE', path: '/api/v1/admin/products/:id/variants/:variantId', auth: 'admin', roles: ['ADMIN'] });

// Images
declareRoute({ method: 'POST', path: '/api/v1/admin/products/:id/images/presign', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/products/:id/images/confirm', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/images/order', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/products/:id/images/:imageId', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'DELETE', path: '/api/v1/admin/products/:id/images/:imageId', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Inventory
declareRoute({ method: 'GET', path: '/api/v1/admin/inventory', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/inventory/low-stock', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/inventory/movements', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/inventory/:variantId/adjust', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/inventory/ledger-check', auth: 'admin', roles: ['ADMIN'], stepUp: true });

// Import
declareRoute({ method: 'GET', path: '/api/v1/admin/import/template', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/import', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/import', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/import/:jobId', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/import/:jobId/errors', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/import/:jobId/validate', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/import/:jobId/apply', auth: 'admin', roles: ['ADMIN'], stepUp: true });

// Export
declareRoute({ method: 'POST', path: '/api/v1/admin/export/products', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/export/orders', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/export/customers', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'GET', path: '/api/v1/admin/export/:exportId', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Customers
declareRoute({ method: 'GET', path: '/api/v1/admin/customers', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/customers/:id', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/customers/:id/sessions', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/sessions/:sessionId/revoke', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/reveal', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'GET', path: '/api/v1/admin/customers/:id/pii', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/disable', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/enable', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/dpdp-export', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/customers/:id/dpdp-erase', auth: 'admin', roles: ['ADMIN'], stepUp: true });

// Staff
declareRoute({ method: 'GET', path: '/api/v1/admin/staff', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/staff', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/staff/:id/role', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/staff/:id/mfa-reset', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/staff/:id/revoke-sessions', auth: 'admin', roles: ['ADMIN'], stepUp: true });

// Admin orders
declareRoute({ method: 'GET', path: '/api/v1/admin/orders', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/orders/:id', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/orders/:id/status', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/orders/:id/ship', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/orders/:id/tracking', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/orders/:id/cancel', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/orders/:id/refund', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'PATCH', path: '/api/v1/admin/orders/:id/address', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'POST', path: '/api/v1/admin/orders/:id/notes', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Security, settings, audit, stats
declareRoute({ method: 'GET', path: '/api/v1/admin/security', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'POST', path: '/api/v1/admin/security/sessions/:id/revoke', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'GET', path: '/api/v1/admin/settings', auth: 'admin', roles: ['ADMIN', 'STAFF'] });
declareRoute({ method: 'PUT', path: '/api/v1/admin/settings/:key', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'GET', path: '/api/v1/admin/audit', auth: 'admin', roles: ['ADMIN'] });
declareRoute({ method: 'GET', path: '/api/v1/admin/stats', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Jobs
declareRoute({ method: 'GET', path: '/api/v1/admin/jobs/:id', auth: 'admin', roles: ['ADMIN', 'STAFF'] });

// Email suppression
declareRoute({ method: 'POST', path: '/api/v1/admin/email/suppress', auth: 'admin', roles: ['ADMIN'], stepUp: true });
declareRoute({ method: 'DELETE', path: '/api/v1/admin/email/suppress/:hash', auth: 'admin', roles: ['ADMIN'] });
