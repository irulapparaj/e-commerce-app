import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';

describe('security baseline', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('sets helmet baseline headers on every response', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/healthz' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never includes a stack trace in error bodies', async () => {
    const res = await testApp.app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('stack');
    expect(res.body).not.toContain('at ');
  });
});
