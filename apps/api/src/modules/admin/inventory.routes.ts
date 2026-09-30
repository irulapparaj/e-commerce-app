import { inventoryAdjustSchema, needsStepUpForAdjustment, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest } from '../audit/record';
import { currentUser } from '../auth/guards';
import { createAdjustService } from '../inventory/adjust.service';
import { runLedgerCheck } from '../inventory/ledger-check.job';
import { listMovements } from '../inventory/ledger.query';
import { listLowStock, listStock } from '../inventory/stock.query';

import { policyGuards } from './policies';

const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
};

export const stockQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  category: uuidSchema.optional(),
  belowThreshold: z.enum(['true', 'false']).optional(),
  ...pagination,
});

export const movementQuery = z
  .strictObject({
    variantId: uuidSchema.optional(),
    reason: z
      .enum(['ORDER_RESERVE', 'ORDER_RELEASE', 'SALE', 'RETURN_RESTOCK', 'ADJUSTMENT', 'IMPORT'])
      .optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    ...pagination,
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

const variantParams = z.strictObject({ variantId: uuidSchema });

/** P06 tasks 5–6. The step-up rule for |delta| > 100 is a guard that reads the validated body. */
export const adminInventoryRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma } = app;
  const adjust = createAdjustService({ prisma, revalidate: app.revalidate });
  const read = policyGuards(guards, 'inventory.read');
  const largeAdjustment = policyGuards(guards, 'inventory.adjust_large');

  app.get(
    '/admin/inventory',
    { schema: { querystring: stockQuery }, preHandler: read },
    async (request) => {
      const { page, limit, q, category } = request.query;
      const result = await listStock(prisma, {
        q,
        categoryId: category,
        belowThreshold: request.query.belowThreshold === 'true',
        page,
        limit,
      });
      return ok(result.rows, { page, limit, total: result.total });
    },
  );

  app.get('/admin/inventory/low-stock', { preHandler: read }, async () =>
    ok(await listLowStock(prisma)),
  );

  app.get(
    '/admin/inventory/movements',
    { schema: { querystring: movementQuery }, preHandler: read },
    async (request) => {
      const { page, limit } = request.query;
      const result = await listMovements(prisma, request.query);
      return ok(result.rows, { page, limit, total: result.total });
    },
  );

  app.post(
    '/admin/inventory/:variantId/adjust',
    {
      schema: { params: variantParams, body: inventoryAdjustSchema },
      preHandler: [
        ...policyGuards(guards, 'inventory.adjust'),
        async (request) => {
          if (!needsStepUpForAdjustment(request.body.delta)) return;
          for (const guard of largeAdjustment) await guard(request);
        },
      ],
    },
    async (request) => {
      const result = await adjust.adjust(
        { variantId: request.params.variantId, ...request.body },
        actorFromRequest(request),
      );
      return ok({ stock: result.stock, movementId: result.movementId });
    },
  );

  app.post(
    '/admin/inventory/ledger-check',
    { preHandler: policyGuards(guards, 'inventory.ledger_check') },
    async (request) =>
      ok(
        await runLedgerCheck(
          { prisma, counters: app.counters, log: app.log },
          { trigger: 'manual', actorId: currentUser(request).id },
        ),
      ),
  );
};
