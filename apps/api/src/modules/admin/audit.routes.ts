import { ok, uuidSchema } from '@pe/shared';
import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { policyGuards } from './policies';

const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;

export const auditQuerySchema = z
  .strictObject({
    actorId: uuidSchema.optional(),
    entityType: z.string().trim().min(1).max(40).optional(),
    entityId: z.string().trim().min(1).max(120).optional(),
    action: z.string().trim().min(1).max(60).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: 'from must not be after to',
    path: ['from'],
  });

export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditWhere = (query: AuditQuery): Prisma.AuditLogWhereInput => ({
  ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
  ...(query.entityType === undefined ? {} : { entityType: query.entityType }),
  ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
  ...(query.action === undefined ? {} : { action: query.action }),
  ...(query.from === undefined && query.to === undefined
    ? {}
    : {
        createdAt: {
          ...(query.from === undefined ? {} : { gte: new Date(query.from) }),
          ...(query.to === undefined ? {} : { lte: new Date(query.to) }),
        },
      }),
});

/** P05 task 4: newest first; before/after are returned as stored (redacted at write time). */
export const auditRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/admin/audit',
    {
      schema: { querystring: auditQuerySchema },
      preHandler: policyGuards(app.guards, 'audit.read'),
    },
    async (request) => {
      const where = auditWhere(request.query);
      const { page, limit } = request.query;
      const [rows, total] = await Promise.all([
        app.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: { actor: { select: { id: true, email: true, role: true } } },
        }),
        app.prisma.auditLog.count({ where }),
      ]);
      const data = rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        before: row.before,
        after: row.after,
        ip: row.ip,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      }));
      return ok(data, { page, limit, total });
    },
  );
};
