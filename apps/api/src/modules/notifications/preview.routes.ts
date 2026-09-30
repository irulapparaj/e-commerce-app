import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { FIXTURES } from './fixtures';
import { renderTemplate } from './render';
import { TEMPLATES, type TemplateName } from './templates';

const templateNameSchema = z.enum(
  Object.keys(TEMPLATES) as [TemplateName, ...TemplateName[]],
);

/**
 * Development-only preview route.
 * MUST NOT be registered in production — `buildApp` asserts NODE_ENV !== 'production'.
 */
export const previewRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/dev/emails/:template',
    {
      schema: {
        params: z.strictObject({ template: templateNameSchema }),
        querystring: z.strictObject({ locale: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const { template } = request.params;
      const fixture = FIXTURES[template];
      const rendered = await renderTemplate(template, fixture);
      void reply.header('content-type', 'text/html; charset=utf-8');
      return reply.send(rendered.html);
    },
  );
};
