import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { checkServiceability } from './serviceability.service';

const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60;

const serviceabilityQuery = z.strictObject({
  pincode: z.string().regex(/^\d{6}$/),
  weightGrams: z.coerce.number().int().min(1).max(100_000),
});

export const shippingRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/shipping/serviceability',
    { schema: { querystring: serviceabilityQuery } },
    async (request) => {
      const { pincode, weightGrams } = request.query;
      const userId = request.user?.id ?? request.ip;

      await app.rateLimiter.consume([
        {
          key: `shipping:svc:${userId}`,
          limit: RATE_LIMIT,
          windowSeconds: RATE_WINDOW_SECONDS,
        },
      ]);

      const result = await checkServiceability(app.valkey, app.ports.shipping, pincode, weightGrams);
      return ok(result);
    },
  );
};
