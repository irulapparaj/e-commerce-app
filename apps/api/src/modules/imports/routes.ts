import { importPresignSchema, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { policyGuards } from '../admin/policies';
import { actorFromRequest } from '../audit/record';
import { currentUser } from '../auth/guards';

import { importDeps } from './deps';
import { createImportService } from './service';
import { buildCsvTemplate, buildXlsxTemplate, TEMPLATE_FILENAME } from './template';

const LIMIT_MAX = 100;
const LIMIT_DEFAULT = 20;
/** DESIGN §11.3: imports 10 / day / admin. */
export const IMPORT_RATE_LIMIT = { limit: 10, windowSeconds: 86_400 } as const;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const templateQuery = z.strictObject({ format: z.enum(['csv', 'xlsx']).default('csv') });
const listQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
});
const jobParams = z.strictObject({ jobId: uuidSchema });

/** P07 tasks 2, 3, 6 and 7: template, upload, validate, report, error CSV, apply, history. */
export const importRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, rateLimiter } = app;
  const service = createImportService(importDeps(app));
  const read = policyGuards(guards, 'imports.read');
  const write = policyGuards(guards, 'imports.write');
  const apply = policyGuards(guards, 'imports.apply');

  app.get(
    '/admin/import/template',
    { schema: { querystring: templateQuery }, preHandler: read },
    async (request, reply) => {
      if (request.query.format === 'xlsx') {
        return reply
          .type(XLSX_TYPE)
          .header('content-disposition', `attachment; filename="${TEMPLATE_FILENAME}.xlsx"`)
          .send(await buildXlsxTemplate());
      }
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${TEMPLATE_FILENAME}.csv"`)
        .send(buildCsvTemplate());
    },
  );

  app.get(
    '/admin/import',
    { schema: { querystring: listQuery }, preHandler: read },
    async (request) => {
      const { page, limit } = request.query;
      const result = await service.list(page, limit);
      return ok(result.rows, { page, limit, total: result.total });
    },
  );

  app.post(
    '/admin/import',
    { schema: { body: importPresignSchema }, preHandler: write },
    async (request, reply) => {
      await rateLimiter.consume([
        { key: `import:admin:${currentUser(request).id}`, ...IMPORT_RATE_LIMIT },
      ]);
      const result = await service.createUpload(request.body, actorFromRequest(request));
      return reply.code(201).send(ok(result));
    },
  );

  app.get(
    '/admin/import/:jobId',
    { schema: { params: jobParams }, preHandler: read },
    async (request) => ok(await service.get(request.params.jobId)),
  );

  app.get(
    '/admin/import/:jobId/errors',
    { schema: { params: jobParams }, preHandler: read },
    async (request) => ok(await service.errorReportUrl(request.params.jobId)),
  );

  app.post(
    '/admin/import/:jobId/validate',
    { schema: { params: jobParams }, preHandler: write },
    async (request, reply) =>
      reply
        .code(202)
        .send(ok(await service.requestValidate(request.params.jobId, actorFromRequest(request)))),
  );

  app.post(
    '/admin/import/:jobId/apply',
    { schema: { params: jobParams }, preHandler: apply },
    async (request, reply) =>
      reply
        .code(202)
        .send(ok(await service.requestApply(request.params.jobId, actorFromRequest(request)))),
  );
};
