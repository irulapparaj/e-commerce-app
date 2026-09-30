import { Writable } from 'node:stream';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../../src/app';
import { createValkeyClient } from '../../../src/lib/valkey';
import { buildLoggerOptions } from '../../../src/plugins/logger';
import { createPorts } from '../../../src/ports';
import { FakeEmailAdapter } from '../../../src/ports/adapters/fake-email';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { readOtp, resetValkey, sendOtp, verifyOtp } from '../../helpers/auth';
import { getPrisma, getPrismaRaw, resetDb } from '../../helpers/db';
import { buildTestEnv } from '../../helpers/env';

const SAMPLES = 20;

const mean = (values: readonly number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

describe('account enumeration resistance', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
  });

  it('shows no measurable timing difference between known and unknown emails over 20 samples each', async () => {
    const prisma = getPrisma();
    for (let i = 0; i < SAMPLES; i += 1)
      await prisma.user.create({ data: { email: `known${i}@example.test` } });
    const time = async (email: string, ip: string): Promise<number> => {
      const started = performance.now();
      await sendOtp(testApp, email, ip);
      return performance.now() - started;
    };

    const known = [];
    const unknown = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      known.push(await time(`known${i}@example.test`, `10.5.${i}.1`));
      unknown.push(await time(`unknown${i}@example.test`, `10.6.${i}.1`));
    }

    expect(Math.abs(mean(known) - mean(unknown))).toBeLessThan(50);
    expect(Math.min(...known, ...unknown)).toBeGreaterThanOrEqual(245);
  });
});

describe('secrets never reach the logs', () => {
  it('logs the OTP flow without the code, tokens or plain email', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const env = buildTestEnv();
    const email = new FakeEmailAdapter();
    const valkey = createValkeyClient(env.VALKEY_URL);
    await valkey.connect();
    const app = await buildApp({
      env,
      ports: createPorts(env, { email }, { prismaRaw: getPrismaRaw() }),
      valkey,
      db: { prisma: getPrisma(), raw: getPrismaRaw() },
      disconnectDbOnClose: false,
      logger: { ...buildLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'development' }), stream },
    });
    await app.ready();
    const wrapped = {
      app,
      env,
      ports: app.ports,
      email,
      valkey,
      close: async () => undefined,
    } as unknown as TestApp;
    await resetDb();

    const address = 'logged@example.test';
    const { nonce } = await sendOtp(wrapped, address);
    const otp = await readOtp(wrapped, address);
    const verified = await verifyOtp(wrapped, address, nonce, otp);
    const session = verified.json<{ data: { accessToken: string; refreshToken: string } }>().data;
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: session.refreshToken },
    });
    await app.close();
    valkey.disconnect();
    const output = lines.join('');

    expect(verified.statusCode).toBe(200);
    expect(output).toContain('auth.otp.issued');
    expect(output).toContain('auth.login');
    expect(output).not.toContain(otp);
    expect(output).not.toContain(session.accessToken);
    expect(output).not.toContain(session.refreshToken);
    expect(output).not.toContain(address);
    expect(output).toContain('sha256:');
  });
});
