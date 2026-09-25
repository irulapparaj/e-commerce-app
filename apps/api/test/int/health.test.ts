import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app';
import { createValkeyClient } from '../../src/lib/valkey';
import { createPorts } from '../../src/ports';
import { buildTestApp, type TestApp } from '../helpers/app';
import { buildTestEnv } from '../helpers/env';

describe('health endpoints', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('answers /healthz with 200', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('answers /readyz with 200 when Valkey and MinIO are reachable', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/readyz' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'ready', checks: { valkey: 'ok', storage: 'ok' } },
      error: null,
    });
  });

  it('answers /readyz with 503 when Valkey is unreachable', async () => {
    const env = buildTestEnv({ VALKEY_URL: 'redis://127.0.0.1:1' });
    const valkey = createValkeyClient(env.VALKEY_URL);
    const app = await buildApp({ env, ports: createPorts(env), valkey, logger: false });

    const res = await app.inject({ method: 'GET', url: '/readyz' });

    expect(res.statusCode).toBe(503);
    const body = res.json<{
      error: { code: string; details: { checks: Record<string, string> } };
    }>();
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.details.checks.valkey).not.toBe('ok');
    expect(body.error.details.checks.storage).toBe('ok');
    await app.close();
    valkey.disconnect();
  });

  it('exposes the request duration histogram on /metrics after a request', async () => {
    await testApp.app.inject({ method: 'GET', url: '/healthz' });
    const res = await testApp.app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http_request_duration_seconds_bucket{');
    expect(res.body).toContain('route="/healthz"');
  });
});
