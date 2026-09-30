import { describe, expect, it } from 'vitest';

import { buildTestEnv } from '../../test/helpers/env';

import { EnvKeyProvider } from './adapters/env-key-provider';
import { FakeEmailAdapter } from './adapters/fake-email';
import { FakeShippingAdapter } from './adapters/fake-shipping';
import { NoopSearchAdapter } from './adapters/noop-search';
import { PostgresSearchAdapter } from './adapters/postgres-search';
import { S3ObjectStorageAdapter } from './adapters/s3-object-storage';
import { SmtpEmailAdapter } from './adapters/smtp-email';

import { createPorts } from './index';

describe('createPorts', () => {
  it('selects local adapters from env', () => {
    const ports = createPorts(buildTestEnv({ EMAIL_ADAPTER: 'smtp', SEARCH_ADAPTER: 'noop' }));

    expect(ports.email).toBeInstanceOf(SmtpEmailAdapter);
    expect(ports.storage).toBeInstanceOf(S3ObjectStorageAdapter);
    expect(ports.keys).toBeInstanceOf(EnvKeyProvider);
    expect(ports.shipping).toBeInstanceOf(FakeShippingAdapter);
    expect(ports.search).toBeInstanceOf(NoopSearchAdapter);
  });

  it('uses the fake email adapter under test and honours overrides', () => {
    const search = new NoopSearchAdapter();
    const ports = createPorts(buildTestEnv({ EMAIL_ADAPTER: 'fake' }), { search });

    expect(ports.email).toBeInstanceOf(FakeEmailAdapter);
    expect(ports.search).toBe(search);
  });

  it('refuses adapters that are not built yet', () => {
    const shiprocket = buildTestEnv({
      SHIPPING_ADAPTER: 'shiprocket',
      SHIPROCKET_EMAIL: 'a',
      SHIPROCKET_PASSWORD: 'b',
      SHIPROCKET_WEBHOOK_SECRET: 'c',
    });
    expect(() => createPorts(shiprocket)).toThrow('Shiprocket');
    expect(() => createPorts(buildTestEnv({ SEARCH_ADAPTER: 'postgres' }))).toThrow('postgres');
  });

  it('builds the Postgres search adapter when given a database client', () => {
    const prismaRaw = {} as never;
    const ports = createPorts(buildTestEnv({ SEARCH_ADAPTER: 'postgres' }), {}, { prismaRaw });

    expect(ports.search).toBeInstanceOf(PostgresSearchAdapter);
  });

  it('builds S3 client config with env-driven path style', () => {
    const config = S3ObjectStorageAdapter.configFromEnv(
      buildTestEnv({ S3_FORCE_PATH_STYLE: 'false' }),
    );

    expect(config.forcePathStyle).toBe(false);
    expect(config.endpoint).toBe('http://localhost:9000');
  });

  it('records sends in the fake email adapter', async () => {
    const email = new FakeEmailAdapter();

    await email.send({ to: 'a@example.test', subject: 's', html: '<p>h</p>', text: 't' });
    await email.send({ to: 'a@example.test', subject: 's2', html: '<p>h</p>', text: 't' });

    expect(email.messages).toHaveLength(2);
    expect(email.lastTo('a@example.test')?.subject).toBe('s2');
    expect(email.lastTo('missing@example.test')).toBeUndefined();
    email.clear();
    expect(email.messages).toHaveLength(0);
  });
});
