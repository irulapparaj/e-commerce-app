import { AppError, ok } from '@pe/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { priceCart } from './pricing';
import { AddItemBody, CouponBody, UpdateItemBody, variantIdParam } from './schemas';
import { atomicAddItem, cartKey, getCart, GUEST_TTL_SECONDS, setCart, USER_CART_TTL_SECONDS } from './store';

const CART_RATE_LIMIT = 120;
const CART_RATE_WINDOW_SECONDS = 60;
const BEARER_PREFIX = 'Bearer ';

interface CartSession {
  readonly key: string;
  readonly isUser: boolean;
}

/**
 * Resolve the cart session from the request.
 * Authenticated storefront users: key = cart:{userId}.
 * Guests: key = cart:{X-Cart-Session header} — missing header → 400.
 * The API never reads cookies (R1).
 */
const resolveCartSession = async (
  request: FastifyRequest,
  app: FastifyInstance,
): Promise<CartSession> => {
  const authHeader = request.headers.authorization ?? '';
  if (authHeader.startsWith(BEARER_PREFIX)) {
    try {
      const claims = await app.auth.tokens.verifyAccess(authHeader.slice(BEARER_PREFIX.length), {
        audience: 'storefront',
      });
      return { key: cartKey(claims.sub), isUser: true };
    } catch {
      // Invalid or expired token — fall through to guest resolution
    }
  }

  const sessionHeader = request.headers['x-cart-session'];
  if (typeof sessionHeader !== 'string' || sessionHeader === '') {
    throw new AppError('VALIDATION', 'X-Cart-Session header required for guest carts');
  }
  return { key: cartKey(sessionHeader), isUser: false };
};

const rateLimit = async (app: FastifyInstance, key: string): Promise<void> => {
  await app.rateLimiter.consume([
    { key, limit: CART_RATE_LIMIT, windowSeconds: CART_RATE_WINDOW_SECONDS },
  ]);
};

/** Routes for the shopping cart (P11). */
export const cartRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  /** GET /cart — return the priced cart (empty if no session data exists). */
  app.get('/cart', {}, async (request) => {
    const session = await resolveCartSession(request, app);
    await rateLimit(app, session.key);

    const threshold = await app.settings.get('free_shipping_threshold');

    const cartTtl = session.isUser ? USER_CART_TTL_SECONDS : GUEST_TTL_SECONDS;
    let storage: Awaited<ReturnType<typeof getCart>>;
    try {
      storage = await getCart(app.valkey, session.key, cartTtl);
    } catch (err) {
      request.log.warn({ err }, 'getCart: Valkey unavailable, returning empty cart');
      storage = null;
    }

    if (storage === null) {
      return ok(
        await priceCart(
          app.prisma,
          app.imageUrls,
          { items: [], updatedAt: new Date().toISOString() },
          threshold,
        ),
      );
    }

    return ok(await priceCart(app.prisma, app.imageUrls, storage, threshold));
  });

  /** POST /cart/items — add or increment an item. */
  app.post('/cart/items', { schema: { body: AddItemBody } }, async (request) => {
    const session = await resolveCartSession(request, app);
    await rateLimit(app, session.key);

    const ttl = session.isUser ? USER_CART_TTL_SECONDS : GUEST_TTL_SECONDS;
    const storage = await atomicAddItem(
      app.valkey,
      session.key,
      request.body.variantId,
      request.body.quantity,
      ttl,
    );

    const threshold = await app.settings.get('free_shipping_threshold');
    return ok(await priceCart(app.prisma, app.imageUrls, storage, threshold));
  });

  /** PUT /cart/items/:variantId — set quantity; quantity=0 removes the item. */
  app.put(
    '/cart/items/:variantId',
    { schema: { params: variantIdParam, body: UpdateItemBody } },
    async (request) => {
      const session = await resolveCartSession(request, app);
      await rateLimit(app, session.key);

      const { variantId } = request.params;
      const { quantity } = request.body;

      const ttl = session.isUser ? USER_CART_TTL_SECONDS : GUEST_TTL_SECONDS;
      const current = await getCart(app.valkey, session.key, ttl);
      const items = current?.items ?? [];

      const updated =
        quantity === 0
          ? items.filter((item) => item.variantId !== variantId)
          : items.some((item) => item.variantId === variantId)
            ? items.map((item) =>
                item.variantId === variantId ? { ...item, quantity } : item,
              )
            : [...items, { variantId, quantity }];

      const nextStorage = {
        items: updated,
        couponCode: current?.couponCode,
        updatedAt: new Date().toISOString(),
      };

      await setCart(app.valkey, session.key, nextStorage, ttl);

      const threshold = await app.settings.get('free_shipping_threshold');
      return ok(await priceCart(app.prisma, app.imageUrls, nextStorage, threshold));
    },
  );

  /** DELETE /cart/items/:variantId — remove an item. */
  app.delete(
    '/cart/items/:variantId',
    { schema: { params: variantIdParam } },
    async (request) => {
      const session = await resolveCartSession(request, app);
      await rateLimit(app, session.key);

      const { variantId } = request.params;
      const ttl = session.isUser ? USER_CART_TTL_SECONDS : GUEST_TTL_SECONDS;
      const current = await getCart(app.valkey, session.key, ttl);

      const nextStorage = {
        items: (current?.items ?? []).filter((item) => item.variantId !== variantId),
        couponCode: current?.couponCode,
        updatedAt: new Date().toISOString(),
      };

      await setCart(app.valkey, session.key, nextStorage, ttl);

      const threshold = await app.settings.get('free_shipping_threshold');
      return ok(await priceCart(app.prisma, app.imageUrls, nextStorage, threshold));
    },
  );

  /** POST /cart/coupon — stub until P23. */
  app.post('/cart/coupon', { schema: { body: CouponBody } }, async () => {
    throw new AppError('VALIDATION', 'Coupons are not available yet');
  });

  /** DELETE /cart/coupon — stub until P23. */
  app.delete('/cart/coupon', {}, async () => {
    throw new AppError('VALIDATION', 'Coupons are not available yet');
  });
};
