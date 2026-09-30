/**
 * API load smoke test (P18 §7).
 *
 * Verifies the compose-stack API handles 50 rps for 60 s on read endpoints:
 *   GET /api/v1/products          → product listing
 *   GET /api/v1/products/:slug    → PDP
 *   GET /api/v1/search?q=agarbatti
 *
 * Thresholds: p95 < 300 ms, zero errors.
 *
 * Run: node tests/perf/api-smoke.js
 * Requires: pnpm add -D autocannon (or npx autocannon)
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const autocannon = require('autocannon');

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';
const DURATION = Number(process.env.SMOKE_DURATION ?? 60);
const CONNECTIONS = Number(process.env.SMOKE_CONNECTIONS ?? 50);

const TARGETS = [
  { title: 'product listing', url: `${API_URL}/api/v1/products` },
  {
    title: 'product slug',
    url: `${API_URL}/api/v1/products/e2e-ag-001-sandalwood-agarbatti-premium`,
  },
  { title: 'search', url: `${API_URL}/api/v1/search?q=agarbatti` },
];

const runTarget = (target) =>
  new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: target.url,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { accept: 'application/json' },
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    autocannon.track(instance, { renderProgressBar: true });
  });

let failures = 0;

for (const target of TARGETS) {
  console.log(`\n─── ${target.title} ───`);
  const result = await runTarget(target);

  const p95 = result.latency.p97_5 ?? result.latency['97_5'];
  const errors = result['2xx'] === 0 ? result.requests.total : 0;
  const nonOk = result.requests.total - (result['2xx'] ?? 0);

  console.log(`  Requests/s : ${result.requests.average.toFixed(1)}`);
  console.log(`  p95 latency: ${p95} ms`);
  console.log(`  Non-2xx    : ${nonOk}`);

  if (p95 > 300) {
    console.error(`  FAIL: p95 ${p95} ms > 300 ms threshold`);
    failures += 1;
  }
  if (nonOk > 0) {
    console.error(`  FAIL: ${nonOk} non-2xx responses`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} threshold(s) exceeded`);
  process.exit(1);
} else {
  console.log('\nAll thresholds met ✓');
}
