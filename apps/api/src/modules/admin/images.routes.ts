import {
  imageAltSchema,
  imageConfirmSchema,
  imagePresignSchema,
  ok,
  reorderSchema,
  uuidSchema,
} from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest } from '../audit/record';
import { toAdminImage } from '../catalogue/admin-dto';

import { policyGuards } from './policies';

const productParams = z.strictObject({ id: uuidSchema });
const imageParams = z.strictObject({ id: uuidSchema, imageId: uuidSchema });

/** P06 task 3: browser uploads straight to the bucket; the API only presigns, confirms and orders. */
export const adminImageRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, catalogue, media, imageUrls } = app;
  const write = policyGuards(guards, 'images.write');
  const ctx = (request: Parameters<typeof actorFromRequest>[0]) => ({
    actor: actorFromRequest(request),
  });

  app.post(
    '/admin/products/:id/images/presign',
    { schema: { params: productParams, body: imagePresignSchema }, preHandler: write },
    async (request) =>
      ok(await media.presignProductImage({ productId: request.params.id, ...request.body })),
  );

  app.post(
    '/admin/products/:id/images/confirm',
    { schema: { params: productParams, body: imageConfirmSchema }, preHandler: write },
    async (request, reply) => {
      const result = await media.confirmUpload(request.body.key, {
        kind: 'product',
        productId: request.params.id,
        alt: request.body.alt,
      });
      return reply.code(202).send(ok(result));
    },
  );

  app.patch(
    '/admin/products/:id/images/order',
    { schema: { params: productParams, body: reorderSchema }, preHandler: write },
    async (request) => {
      const images = await catalogue.images.reorder(
        request.params.id,
        request.body.orderedIds,
        ctx(request),
      );
      return ok(await Promise.all(images.map((image) => toAdminImage(image, imageUrls))));
    },
  );

  app.patch(
    '/admin/products/:id/images/:imageId',
    { schema: { params: imageParams, body: imageAltSchema }, preHandler: write },
    async (request) =>
      ok(
        await toAdminImage(
          await catalogue.images.updateAlt(
            request.params.id,
            request.params.imageId,
            request.body.alt,
            ctx(request),
          ),
          imageUrls,
        ),
      ),
  );

  app.delete(
    '/admin/products/:id/images/:imageId',
    { schema: { params: imageParams }, preHandler: write },
    async (request) => {
      await catalogue.images.remove(request.params.id, request.params.imageId, ctx(request));
      return ok({ deleted: true });
    },
  );
};
