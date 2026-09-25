import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { healthPlugin } from './health';

describe('health plugin', () => {
  it('always answers /healthz with 200', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthPlugin);

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { status: 'ok' }, error: null });
  });

  it('reports ready when every registered check passes', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthPlugin);
    app.readiness.add({ name: 'valkey', check: async () => 'PONG' });

    const res = await app.inject({ method: 'GET', url: '/readyz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'ready', checks: { valkey: 'ok' } },
      error: null,
    });
  });

  it('returns 503 naming the failing check', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthPlugin);
    app.readiness.add({ name: 'valkey', check: async () => 'PONG' });
    app.readiness.add({
      name: 'storage',
      check: async () => {
        throw new Error('bucket missing');
      },
    });

    const res = await app.inject({ method: 'GET', url: '/readyz' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Not ready',
        details: { checks: { valkey: 'ok', storage: 'bucket missing' } },
      },
    });
  });

  it('fails a check that hangs past the timeout', async () => {
    const app = Fastify({ logger: false });
    await app.register(healthPlugin);
    app.readiness.add({ name: 'slow', check: () => new Promise(() => undefined) });

    const res = await app.inject({ method: 'GET', url: '/readyz' });

    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('slow timed out');
  }, 10_000);
});
