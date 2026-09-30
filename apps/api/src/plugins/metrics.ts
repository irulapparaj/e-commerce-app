import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

import { sharedPlugin } from '../lib/plugin';

const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const MS_PER_SECOND = 1000;

export interface Metrics {
  readonly registry: Registry;
  readonly httpDuration: Histogram<'method' | 'route' | 'status_code'>;
  counter(name: string, help: string, labelNames?: readonly string[]): Counter<string>;
}

export const createMetrics = (): Metrics => {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: DURATION_BUCKETS,
    registers: [registry],
  });
  const counters = new Map<string, Counter<string>>();
  const counter = (
    name: string,
    help: string,
    labelNames: readonly string[] = [],
  ): Counter<string> => {
    const existing = counters.get(name);
    if (existing) return existing;
    const created = new Counter({ name, help, labelNames: [...labelNames], registers: [registry] });
    counters.set(name, created);
    return created;
  };
  return { registry, httpDuration, counter };
};

export const metricsPlugin = sharedPlugin(async (app) => {
  const metrics = createMetrics();
  app.decorate('metrics', metrics);

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';
    metrics.httpDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      reply.elapsedTime / MS_PER_SECOND,
    );
  });

  app.get('/metrics', async (_request, reply) => {
    const body = await metrics.registry.metrics();
    return reply.type(metrics.registry.contentType).send(body);
  });
});
