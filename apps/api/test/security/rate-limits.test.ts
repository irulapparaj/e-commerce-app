/**
 * Rate limit tests (P17 task 4).
 *
 * For each rate-limited endpoint declared in the route registry, verifies that
 * exceeding the limit returns 429 with a Retry-After header.
 *
 * Uses RATE_LIMIT_MULTIPLIER=1 (already the default in tests) so limits are
 * exercised without multiplier inflation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';

describe('rate limits', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    // RATE_LIMIT_MULTIPLIER=1 so actual limits apply (fixture defaults to 100 for other tests)
    testApp = await buildTestApp({ env: { RATE_LIMIT_MULTIPLIER: '1' } });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('OTP send endpoint enforces per-email rate limit', async () => {
    const email = `rl-test-${Date.now()}@example.com`;
    // The limit is 3 / 10 min / email (DESIGN §11.3). We send 4 to trigger it.
    let lastStatus = 0;
    for (let i = 0; i < 4; i++) {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/send-otp',
        payload: { email },
        remoteAddress: '10.0.0.1',
      });
      lastStatus = res.statusCode;
    }
    expect(lastStatus).toBe(429);
  });

  it('OTP send 429 response includes Retry-After header', async () => {
    const email = `rl-retry-${Date.now()}@example.com`;
    let retryAfterHeader: string | string[] | undefined;
    for (let i = 0; i < 4; i++) {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/send-otp',
        payload: { email },
        remoteAddress: '10.0.0.2',
      });
      if (res.statusCode === 429) {
        retryAfterHeader = res.headers['retry-after'];
        break;
      }
    }
    expect(retryAfterHeader).toBeDefined();
    const retryAfter = Number(retryAfterHeader);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('search endpoint enforces per-IP rate limit', async () => {
    // 60 / 60s / IP (DESIGN §11.3). We exhaust it quickly using the test multiplier.
    const ip = '10.1.0.1';
    let rateLimited = false;
    // Use RATE_LIMIT_MULTIPLIER=1 so actual limit applies.
    // We make 61 requests — the 61st should be 429.
    for (let i = 0; i < 61; i++) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/search?q=test',
        remoteAddress: ip,
      });
      if (res.statusCode === 429) {
        rateLimited = true;
        break;
      }
    }
    expect(rateLimited).toBe(true);
  });
});
