import { categoryInputSchema, imagePresignSchema, ok, reorderSchema, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest } from '../audit/record';
import { buildAdminCategoryTree, toAdminCategory } from '../catalogue/admin-dto';

import { policyGuards } from './policies';

const idParams = z.strictObject({ id: uuidSchema });
const confirmBody = z.strictObject({ key: z.string().min(1).max(200) });

/** P06 task 4: tree with counts for everyone, writes for ADMIN (no step-up per §8.1). */
export const adminCategoryRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, catalogue, media, imageUrls } = app;
  const read = policyGuards(guards, 'categories.read');
  const write = policyGuards(guards, 'categories.write');
  const ctx = (request: Parameters<typeof actorFromRequest>[0]) => ({
    actor: actorFromRequest(request),
  });
  const productCount = (id: string) => prisma.product.count({ where: { categoryId: id } });

  app.get('/admin/categories', { preHandler: read }, async () =>
    ok(await buildAdminCategoryTree(prisma, imageUrls)),
  );

  app.post(
    '/admin/categories',
    { schema: { body: categoryInputSchema }, preHandler: write },
    async (request, reply) =>
      reply
        .code(201)
        .send(
          ok(
            await toAdminCategory(
              await catalogue.categories.create(request.body, ctx(request)),
              imageUrls,
            ),
          ),
        ),
  );

  app.put(
    '/admin/categories/:id',
    { schema: { params: idParams, body: categoryInputSchema }, preHandler: write },
    async (request) => {
      const row = await catalogue.categories.update(request.params.id, request.body, ctx(request));
      return ok(await toAdminCategory(row, imageUrls, await productCount(row.id)));
    },
  );

  app.patch(
    '/admin/categories/reorder',
    { schema: { body: reorderSchema }, preHandler: write },
    async (request) => {
      const rows = await catalogue.categories.reorder(request.body.orderedIds, ctx(request));
      return ok(
        await Promise.all(
          rows.map(async (row) => toAdminCategory(row, imageUrls, await productCount(row.id))),
        ),
      );
    },
  );

  app.delete(
    '/admin/categories/:id',
    { schema: { params: idParams }, preHandler: write },
    async (request) => {
      await catalogue.categories.remove(request.params.id, ctx(request));
      return ok({ deleted: true });
    },
  );

  app.post(
    '/admin/categories/:id/image/presign',
    { schema: { params: idParams, body: imagePresignSchema }, preHandler: write },
    async (request) =>
      ok(await media.presignCategoryImage({ categoryId: request.params.id, ...request.body })),
  );

  app.post(
    '/admin/categories/:id/image/confirm',
    { schema: { params: idParams, body: confirmBody }, preHandler: write },
    async (request, reply) =>
      reply.code(202).send(
        ok(
          await media.confirmUpload(request.body.key, {
            kind: 'category',
            categoryId: request.params.id,
          }),
        ),
      ),
  );
};
