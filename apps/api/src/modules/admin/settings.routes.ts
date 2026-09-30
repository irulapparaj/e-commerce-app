import { AppError, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { actorFromRequest, recordAudit } from '../audit/record';
import { currentUser } from '../auth/guards';
import { HOME_TAG, SETTINGS_TAG } from '../revalidate/tags';

import { policyGuards } from './policies';
import {
  HOME_SETTING_KEYS,
  isSettingKey,
  parseSetting,
  settingBody,
  settingKeyParams,
} from './settings.schemas';

/** P05 tasks 1–2: typed settings per key; writes are ADMIN + step-up, audited and cache-busting. */
export const settingsRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, settings, prisma } = app;

  app.get('/admin/settings', { preHandler: policyGuards(guards, 'settings.read') }, async () =>
    ok(await settings.getAll()),
  );

  app.put(
    '/admin/settings/:key',
    {
      schema: { params: settingKeyParams, body: settingBody },
      preHandler: policyGuards(guards, 'settings.write'),
    },
    async (request) => {
      const { key } = request.params;
      if (!isSettingKey(key)) throw new AppError('NOT_FOUND', `Unknown setting ${key}`);
      const parsed = parseSetting(key, request.body.value);
      if (!parsed.success) {
        throw new AppError('VALIDATION', `Invalid value for ${key}`, {
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.map(String).join('.'),
            message: issue.message,
          })),
        });
      }
      const before = await settings.get(key);
      await prisma.$transaction(async (tx) => {
        await settings.set(tx, key, parsed.data, currentUser(request).id);
        await recordAudit(tx, {
          ...actorFromRequest(request),
          action: 'settings.updated',
          entityType: 'setting',
          entityId: key,
          before,
          after: parsed.data,
        });
      });
      await settings.invalidate();
      if (HOME_SETTING_KEYS.includes(key)) await app.revalidate.notify([HOME_TAG, SETTINGS_TAG]);
      return ok(parsed.data);
    },
  );
};
