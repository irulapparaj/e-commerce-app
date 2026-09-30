import { AppError, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { ExportGeneratePayload, ExportType } from '../../jobs/queue';
import { policyGuards } from '../admin/policies';
import { actorFromRequest, recordAudit } from '../audit/record';
import { currentUser } from '../auth/guards';

import type { ExportGenerateResult } from './generate.job';

export const EXPORT_LINK_TTL_SECONDS = 900;
const REASON_MIN = 10;
const REASON_MAX = 500;

/** `full=true` is a PII exfiltration path: it needs a justification (DESIGN §11.3). */
export const sensitiveExportBody = z
  .strictObject({
    full: z.boolean().default(false),
    reason: z.string().trim().min(REASON_MIN).max(REASON_MAX).optional(),
  })
  .refine((body) => !body.full || body.reason !== undefined, {
    message: `A reason of at least ${REASON_MIN} characters is required for a full export`,
    path: ['reason'],
  });

const exportParams = z.strictObject({ exportId: uuidSchema });

interface ExportStatusDto {
  readonly id: string;
  readonly type: ExportType;
  readonly state: string;
  readonly url: string | null;
  readonly expiresAt: string | null;
  readonly error: string | null;
}

/** P07 task 8: exports run as jobs; the result link is a 15-minute presigned GET. */
export const exportRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, jobs } = app;
  const storage = app.ports.storage;
  const bucket = app.env.S3_BUCKET_IMPORTS;

  const enqueue = async (
    request: Parameters<typeof actorFromRequest>[0],
    type: ExportType,
    body: { full: boolean; reason?: string | undefined },
  ) => {
    const payload: ExportGeneratePayload = {
      type,
      actorId: currentUser(request).id,
      full: body.full,
    };
    const exportId = await jobs.send('export-generate', payload);
    if (exportId === null) throw new AppError('INTERNAL', 'Could not enqueue the export');
    await recordAudit(prisma, {
      ...actorFromRequest(request),
      action: 'export.requested',
      entityType: 'export',
      entityId: exportId,
      after: {
        type,
        full: body.full,
        ...(body.reason === undefined ? {} : { reason: body.reason }),
      },
    });
    return { exportId };
  };

  app.post(
    '/admin/export/products',
    { preHandler: policyGuards(guards, 'exports.products') },
    async (request, reply) =>
      reply.code(202).send(ok(await enqueue(request, 'products', { full: false }))),
  );

  for (const type of ['orders', 'customers'] as const) {
    app.post(
      `/admin/export/${type}`,
      {
        schema: { body: sensitiveExportBody },
        preHandler: policyGuards(guards, 'exports.sensitive'),
      },
      async (request, reply) =>
        reply.code(202).send(ok(await enqueue(request, type, request.body))),
    );
  }

  app.get(
    '/admin/export/:exportId',
    { schema: { params: exportParams }, preHandler: policyGuards(guards, 'exports.read') },
    async (request) => {
      const job = await jobs.getJob('export-generate', request.params.exportId);
      const data = job?.data as ExportGeneratePayload | undefined;
      if (job === null || data === undefined) throw new AppError('NOT_FOUND', 'Export not found');
      // STAFF may only follow product exports; sensitive ones are invisible to them (P07 §6).
      if (currentUser(request).role !== 'ADMIN' && data.type !== 'products')
        throw new AppError('NOT_FOUND', 'Export not found');
      const output = job.state === 'completed' ? (job.output as ExportGenerateResult) : null;
      const url =
        output === null
          ? null
          : (
              await storage.presignGet({
                bucket,
                key: output.key,
                expiresSec: EXPORT_LINK_TTL_SECONDS,
              })
            ).url;
      const dto: ExportStatusDto = {
        id: job.id,
        type: data.type,
        state: job.state,
        url,
        expiresAt: output?.expiresAt ?? null,
        error: job.error,
      };
      return ok(dto);
    },
  );
};
