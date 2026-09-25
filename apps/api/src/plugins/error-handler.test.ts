import { AppError } from '@pe/shared';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { errorHandlerPlugin } from './error-handler';

const buildApp = async () => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorHandlerPlugin);
  app.post(
    '/validate',
    { schema: { body: z.strictObject({ pincode: z.string().regex(/^\d{6}$/) }) } },
    async () => ({ ok: true }),
  );
  app.get('/app-error', async () => {
    throw new AppError('INSUFFICIENT_STOCK', 'Only 2 left', { details: { available: 2 } });
  });
  app.get('/boom', async () => {
    throw new Error('secret internal detail');
  });
  app.get('/sensible', async (_req, reply) =>
    reply.code(404).send({ statusCode: 404, message: 'nope' }),
  );
  app.get('/http-error', async () => {
    const error = Object.assign(new Error('Payload Too Large'), { statusCode: 413 });
    throw error;
  });
  return app;
};

describe('error handler', () => {
  it('maps AppError to its status and code with details', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/app-error' });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({
      success: false,
      data: null,
      error: { code: 'INSUFFICIENT_STOCK', message: 'Only 2 left', details: { available: 2 } },
    });
  });

  it('maps Zod validation failures to 400 VALIDATION with a field list', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { pincode: '12', extra: 1 },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; details: { path: string }[] } }>();
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.details.map((d) => d.path)).toContain('pincode');
  });

  it('hides unknown errors behind 500 INTERNAL without a stack or message', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/boom' });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internal detail');
    expect(res.body).not.toContain('stack');
    expect(res.json()).toEqual({
      success: false,
      data: null,
      error: { code: 'INTERNAL', message: 'Something went wrong' },
    });
  });

  it('maps HTTP errors with a 4xx status code to the matching stable code', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/http-error' });

    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION');
  });

  it('returns the envelope for unknown routes', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/missing' });

    expect(res.statusCode).toBe(404);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('NOT_FOUND');
  });
});
