import { AppError, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { JOB_NAMES, type JobStatus } from '../../jobs/queue';

import { policyGuards } from './policies';

const jobParams = z.strictObject({ id: z.uuid() });

/** Small generic status endpoint used by the image uploader to poll `media-process` (P06 §5). */
export const adminJobRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/admin/jobs/:id',
    { schema: { params: jobParams }, preHandler: policyGuards(app.guards, 'jobs.read') },
    async (request) => {
      let found: JobStatus | null = null;
      for (const name of JOB_NAMES) {
        found = await app.jobs.getJob(name, request.params.id);
        if (found !== null) break;
      }
      if (found === null) throw new AppError('NOT_FOUND', 'Job not found');
      return ok({
        id: found.id,
        name: found.name,
        state: found.state,
        error: found.error,
        output: found.output,
        createdOn: found.createdOn.toISOString(),
        completedOn: found.completedOn?.toISOString() ?? null,
      });
    },
  );
};
