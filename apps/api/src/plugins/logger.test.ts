import { Writable } from 'node:stream';

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { buildLoggerOptions, hashEmail, REDACT_PATHS, scrubLogObject } from './logger';

const captureLogs = () => {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, stream };
};

describe('scrubLogObject', () => {
  it('hashes email values at any depth without mutating the input', () => {
    const input = {
      email: 'A@Example.com',
      nested: { user: { email: 'b@example.com' } },
      list: [{ email: 'c@x.io' }],
    };
    const output = scrubLogObject(input) as typeof input;

    expect(output.email).toBe(hashEmail('a@example.com'));
    expect(output.nested.user.email).toMatch(/^sha256:[0-9a-f]{8}$/);
    expect(output.list[0]?.email).toMatch(/^sha256:/);
    expect(input.email).toBe('A@Example.com');
  });

  it('leaves class instances and primitives untouched', () => {
    class Req {
      email = 'x@y.z';
    }
    const req = new Req();

    expect(scrubLogObject(req)).toBe(req);
    expect(scrubLogObject('plain')).toBe('plain');
    expect(scrubLogObject(null)).toBeNull();
  });

  it('truncates beyond the depth limit', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'x' } } } } } } } } } };

    expect(JSON.stringify(scrubLogObject(deep))).toContain('[TRUNCATED]');
  });
});

describe('logger redaction', () => {
  it('redacts tokens, otp, phone, address lines and hashes email in emitted lines', async () => {
    const { lines, stream } = captureLogs();
    const app = Fastify({
      logger: { ...buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'development' }), stream },
    });

    app.log.info({
      email: 'customer@example.com',
      otp: '123456',
      phone: '9876543210',
      address: { line1: '12 Temple Street', line2: 'Mylapore', city: 'Chennai' },
      auth: { headers: { authorization: 'Bearer abc', cookie: 'a=b' } },
      session: { refreshToken: 'rt', accessToken: 'at', token: 't' },
    });
    await app.close();

    const line = lines.join('');
    expect(line).not.toContain('123456');
    expect(line).not.toContain('9876543210');
    expect(line).not.toContain('Temple Street');
    expect(line).not.toContain('Mylapore');
    expect(line).not.toContain('Bearer abc');
    expect(line).not.toContain('a=b');
    expect(line).not.toContain('customer@example.com');
    expect(line).toContain('"city":"Chennai"');
    expect(line).toContain(hashEmail('customer@example.com'));
    expect(line).not.toMatch(/"(refreshToken|accessToken|token)":"(rt|at|t)"/);
  });

  it('silences logs under NODE_ENV=test', () => {
    expect(buildLoggerOptions({ LOG_LEVEL: 'debug', NODE_ENV: 'test' }).level).toBe('silent');
    expect(REDACT_PATHS).toContain('req.headers.authorization');
  });
});
