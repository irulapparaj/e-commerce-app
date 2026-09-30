import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { policyGuards } from './policies';
import { type AdminStats, computeStats } from './stats.query';

export const STATS_CACHE_KEY = 'admin:stats';
export const STATS_TTL_SECONDS = 60;

export const statsRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get('/admin/stats', { preHandler: policyGuards(app.guards, 'stats.read') }, async () => {
    const cached = await app.cache.get<AdminStats>(STATS_CACHE_KEY);
    if (cached !== null) return ok(cached);
    const gst = await app.settings.get('gst_profile');
    const stats = await computeStats(app.prisma, new Date(), gst.isPlaceholder);
    await app.cache.set(STATS_CACHE_KEY, stats, STATS_TTL_SECONDS);
    return ok(stats);
  });
};
