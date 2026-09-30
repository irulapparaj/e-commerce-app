import {
  ok,
  uuidSchema,
  variantContentPatchSchema,
  variantCreateSchema,
  variantPriceSchema,
} from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest } from '../audit/record';
import { toAdminVariant } from '../catalogue/admin-dto';

import { policyGuards } from './policies';

const productParams = z.strictObject({ id: uuidSchema });
const variantParams = z.strictObject({ id: uuidSchema, variantId: uuidSchema });

/** P06 task 2: content edits for STAFF, anything that sets a price is ADMIN + step-up. */
export const adminVariantRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, catalogue } = app;
  const ctx = (request: Parameters<typeof actorFromRequest>[0]) => ({
    actor: actorFromRequest(request),
  });

  app.post(
    '/admin/products/:id/variants',
    {
      schema: { params: productParams, body: variantCreateSchema },
      preHandler: policyGuards(guards, 'variants.price'),
    },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          ok(
            toAdminVariant(
              await catalogue.variants.create(request.params.id, request.body, ctx(request)),
            ),
          ),
        ),
  );

  app.patch(
    '/admin/products/:id/variants/:variantId',
    {
      schema: { params: variantParams, body: variantContentPatchSchema },
      preHandler: policyGuards(guards, 'variants.content'),
    },
    async (request) =>
      ok(
        toAdminVariant(
          await catalogue.variants.updateContent(
            request.params.id,
            request.params.variantId,
            request.body,
            ctx(request),
          ),
        ),
      ),
  );

  app.patch(
    '/admin/products/:id/variants/:variantId/price',
    {
      schema: { params: variantParams, body: variantPriceSchema },
      preHandler: policyGuards(guards, 'variants.price'),
    },
    async (request) =>
      ok(
        toAdminVariant(
          await catalogue.variants.updatePrice(
            request.params.id,
            request.params.variantId,
            request.body,
            ctx(request),
          ),
        ),
      ),
  );

  app.delete(
    '/admin/products/:id/variants/:variantId',
    { schema: { params: variantParams }, preHandler: policyGuards(guards, 'variants.price') },
    async (request) => {
      await catalogue.variants.remove(request.params.id, request.params.variantId, ctx(request));
      return ok({ deleted: true });
    },
  );
};
