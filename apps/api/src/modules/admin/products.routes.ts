import {
  ok,
  productCommercialPatchSchema,
  productContentPatchSchema,
  productCreateSchema,
  productPublishSchema,
  uuidSchema,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest } from '../audit/record';
import { toAdminProductDetail, toAdminProductRow } from '../catalogue/admin-dto';
import { ADMIN_PRODUCT_INCLUDE, type AdminProductRow } from '../catalogue/service-deps';

import { policyGuards } from './policies';

const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;

export const productListQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  category: uuidSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
});

const idParams = z.strictObject({ id: uuidSchema });

const listWhere = (query: z.infer<typeof productListQuery>): Prisma.ProductWhereInput => ({
  ...(query.status === 'all' ? {} : { isActive: query.status === 'active' }),
  ...(query.category === undefined ? {} : { categoryId: query.category }),
  ...(query.q === undefined
    ? {}
    : {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { sku: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
});

/** P06 task 1: content vs commercial vs publish are separate routes so the guard is route-level. */
export const adminProductRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, catalogue, imageUrls } = app;
  const ctx = (request: Parameters<typeof actorFromRequest>[0]) => ({
    actor: actorFromRequest(request),
  });

  const detail = async (row: AdminProductRow) => {
    const ordered = await prisma.orderItem.count({
      where: { variantId: { in: row.variants.map((variant) => variant.id) } },
    });
    return ok(await toAdminProductDetail(row, imageUrls, ordered > 0));
  };

  app.get(
    '/admin/products',
    {
      schema: { querystring: productListQuery },
      preHandler: policyGuards(guards, 'products.read'),
    },
    async (request) => {
      const where = listWhere(request.query);
      const { page, limit } = request.query;
      const [rows, total] = await Promise.all([
        prisma.product.findMany({
          where,
          include: ADMIN_PRODUCT_INCLUDE,
          orderBy: { updatedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.product.count({ where }),
      ]);
      return ok(await Promise.all(rows.map((row) => toAdminProductRow(row, imageUrls))), {
        page,
        limit,
        total,
      });
    },
  );

  app.get(
    '/admin/products/:id',
    { schema: { params: idParams }, preHandler: policyGuards(guards, 'products.read') },
    async (request) => detail(await catalogue.products.get(request.params.id)),
  );

  app.post(
    '/admin/products',
    { schema: { body: productCreateSchema }, preHandler: policyGuards(guards, 'products.content') },
    async (request, reply) =>
      reply
        .code(201)
        .send(await detail(await catalogue.products.create(request.body, ctx(request)))),
  );

  app.patch(
    '/admin/products/:id/content',
    {
      schema: { params: idParams, body: productContentPatchSchema },
      preHandler: policyGuards(guards, 'products.content'),
    },
    async (request) =>
      detail(await catalogue.products.updateContent(request.params.id, request.body, ctx(request))),
  );

  app.patch(
    '/admin/products/:id/commercial',
    {
      schema: { params: idParams, body: productCommercialPatchSchema },
      preHandler: policyGuards(guards, 'products.commercial'),
    },
    async (request) =>
      detail(
        await catalogue.products.updateCommercial(request.params.id, request.body, ctx(request)),
      ),
  );

  app.patch(
    '/admin/products/:id/publish',
    {
      schema: { params: idParams, body: productPublishSchema },
      preHandler: policyGuards(guards, 'products.commercial'),
    },
    async (request) =>
      detail(
        await catalogue.products.setActive(request.params.id, request.body.isActive, ctx(request)),
      ),
  );

  app.delete(
    '/admin/products/:id',
    { schema: { params: idParams }, preHandler: policyGuards(guards, 'products.commercial') },
    async (request) => {
      await catalogue.products.remove(request.params.id, ctx(request));
      return ok({ deleted: true });
    },
  );
};
