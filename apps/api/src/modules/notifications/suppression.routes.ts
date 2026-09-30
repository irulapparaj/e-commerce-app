import { ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { policyGuards } from '../admin/policies';
import { actorFromRequest, recordAudit } from '../audit/record';

import { addSuppression, hashEmail } from './suppression';

const suppressBody = z.strictObject({
  email: z.string().email(),
  reason: z.enum(['BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE']),
});

const suppressParams = z.strictObject({ hash: z.string().length(64) });

export const suppressionRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma } = app;

  app.post(
    '/admin/email/suppress',
    { preHandler: policyGuards(guards, 'email.suppress') },
    async (request) => {
      const { email, reason } = suppressBody.parse(request.body);
      const emailHash = hashEmail(app.ports.keys, email);
      await addSuppression({ prisma, emailHash, reason });
      return ok({ emailHash });
    },
  );

  app.delete(
    '/admin/email/suppress/:hash',
    {
      preHandler: policyGuards(guards, 'email.suppress'),
      schema: { params: suppressParams },
    },
    async (request) => {
      const { hash } = request.params;
      await prisma.emailSuppression.deleteMany({ where: { emailHash: hash } });
      await recordAudit(prisma, {
        ...actorFromRequest(request),
        action: 'email.suppression_removed',
        entityType: 'email_suppression',
        entityId: hash,
        before: { emailHash: hash },
        after: null,
      });
      return ok({ removed: true });
    },
  );
};
