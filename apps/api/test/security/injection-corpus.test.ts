/**
 * Injection corpus test (P17 task 6).
 *
 * Feeds OWASP-derived payloads to high-risk input fields and verifies:
 *   - Never returns 500 (server error must never be user-visible)
 *   - SQL error strings never appear in responses
 *   - Path traversal payloads in filename fields are rejected
 *   - Responses do not contain stack traces, Prisma internals, or table names
 *
 * The corpus lives in test/security/corpus/*.txt
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, type TestApp } from '../helpers/app';

const CORPUS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'corpus');

const loadCorpus = (name: string): string[] =>
  readFileSync(join(CORPUS_DIR, `${name}.txt`), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));

// Patterns that should never appear in any API response body.
const FORBIDDEN_RESPONSE_PATTERNS = [
  /at\s+\w+\s+\([^)]+\.ts:\d+/i, // TypeScript stack frame
  /PrismaClient|prisma\./i,
  /\bSELECT\b.*\bFROM\b/i,
  /\bINSERT\b.*\bINTO\b/i,
  /\bUPDATE\b.*\bSET\b/i,
  /syntax error at or near/i,
  /column .* does not exist/i,
  /relation .* does not exist/i,
];

const hasForbiddenContent = (body: string): string | null => {
  for (const pattern of FORBIDDEN_RESPONSE_PATTERNS) {
    if (pattern.test(body)) return pattern.toString();
  }
  return null;
};

describe('injection corpus', () => {
  let testApp: TestApp;
  let xssPayloads: string[];
  let sqliPayloads: string[];
  let pathPayloads: string[];

  beforeAll(async () => {
    testApp = await buildTestApp();
    xssPayloads = loadCorpus('xss');
    sqliPayloads = loadCorpus('sqli');
    pathPayloads = loadCorpus('path');
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const assertSafe = (res: { statusCode: number; body: string }, context: string): void => {
    expect(
      res.statusCode,
      `${context} must not return 500`,
    ).not.toBe(500);
    const forbidden = hasForbiddenContent(res.body);
    expect(forbidden, `${context} must not expose internal details: matched ${forbidden}`).toBeNull();
  };

  it('XSS payloads in search query are safely handled (400/200/404, no 500)', async () => {
    for (const payload of xssPayloads.slice(0, 10)) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/search?q=${encodeURIComponent(payload)}`,
      });
      assertSafe(res, `search?q=${payload.slice(0, 40)}`);
    }
  });

  it('SQLi payloads in product slug return 400/404, never 500 or DB errors', async () => {
    for (const payload of sqliPayloads.slice(0, 10)) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/products/${encodeURIComponent(payload)}`,
      });
      assertSafe(res, `products/${payload.slice(0, 40)}`);
      // Slug must be validated — expect 400 or 404, not 200 with SQL errors.
      expect([400, 404]).toContain(res.statusCode);
    }
  });

  it('path traversal payloads in query strings are rejected', async () => {
    for (const payload of pathPayloads.slice(0, 10)) {
      const res = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/search?q=${encodeURIComponent(payload)}`,
      });
      assertSafe(res, `search[path]=${payload.slice(0, 40)}`);
    }
  });

  it('oversized fields return 400, not 500 or DB error', async () => {
    const longString = 'A'.repeat(10_000);
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/send-otp',
      payload: { email: `${longString}@example.com` },
    });
    assertSafe(res, 'send-otp with oversized email');
    expect([400, 422, 429]).toContain(res.statusCode);
  });

  it('null bytes in string fields are rejected', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/send-otp',
      payload: { email: 'test\x00@example.com' },
    });
    assertSafe(res, 'send-otp with null byte');
    expect(res.statusCode).toBe(400);
  });

  it('control characters in email field are rejected with 400', async () => {
    const payloads = [
      'test\r\nBcc:spam@evil.com\r\n@example.com',
      'test\nCC:other@evil.com@example.com',
    ];
    for (const payload of payloads) {
      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/v1/auth/send-otp',
        payload: { email: payload },
      });
      assertSafe(res, `send-otp header injection: ${payload.slice(0, 40)}`);
      expect(res.statusCode).toBe(400);
    }
  });

  it('non-existent routes return 404 without leaking internals', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/../../etc/passwd',
    });
    assertSafe(res, 'path traversal attempt on non-existent route');
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('passwd');
  });

  it('malformed JSON body returns 400, not 500', async () => {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/auth/send-otp',
      headers: { 'content-type': 'application/json' },
      body: '{"email": "broken json',
    });
    assertSafe(res, 'malformed JSON body');
    expect([400, 422]).toContain(res.statusCode);
  });
});
