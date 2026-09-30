import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { createMetrics, metricsPlugin } from './metrics';

describe('metrics plugin', () => {
  it('records a request duration histogram and serves it on /metrics', async () => {
    const app = Fastify({ logger: false });
    await app.register(metricsPlugin);
    app.get('/ping', async () => ({ pong: true }));

    await app.inject({ method: 'GET', url: '/ping' });
    const res = await app.inject({ method: 'GET', url: '/metrics' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain(
      'http_request_duration_seconds_count{method="GET",route="/ping",status_code="200"} 1',
    );
    await app.close();
  });

  it('reuses counters by name', () => {
    const metrics = createMetrics();
    const first = metrics.counter('auth_events_total', 'Auth events', ['event']);
    const second = metrics.counter('auth_events_total', 'Auth events', ['event']);

    expect(first).toBe(second);
  });
});
