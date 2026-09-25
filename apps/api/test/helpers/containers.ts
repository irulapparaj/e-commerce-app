import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

import { migrateTestDatabase } from './migrate';

const POSTGRES_IMAGE = 'postgres:16-alpine';
const VALKEY_IMAGE = 'valkey/valkey:8-alpine';
const MINIO_IMAGE = 'minio/minio:RELEASE.2025-10-15T17-29-55Z';
const MAILPIT_IMAGE = 'axllent/mailpit:v1.31.2';
const MINIO_USER = 'minioadmin';
const MINIO_PASSWORD = 'minioadmin';
const BUCKETS = ['media', 'imports'] as const;

interface StackUrls {
  readonly databaseUrl: string;
  readonly valkeyUrl: string;
  readonly s3Endpoint: string;
  readonly s3AccessKey: string;
  readonly s3SecretKey: string;
  readonly smtpUrl: string;
  readonly mailpitUrl: string;
}

const ensureBuckets = async (urls: StackUrls): Promise<void> => {
  const client = new S3Client({
    endpoint: urls.s3Endpoint,
    region: 'ap-south-1',
    forcePathStyle: true,
    credentials: { accessKeyId: urls.s3AccessKey, secretAccessKey: urls.s3SecretKey },
  });
  for (const bucket of BUCKETS) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }
  client.destroy();
};

const externalStack = (): StackUrls => {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`TEST_STACK=external requires ${key}`);
    return value;
  };
  return {
    databaseUrl: required('TEST_DATABASE_URL'),
    valkeyUrl: required('TEST_VALKEY_URL'),
    s3Endpoint: required('TEST_S3_ENDPOINT'),
    s3AccessKey: process.env.TEST_S3_ACCESS_KEY ?? MINIO_USER,
    s3SecretKey: process.env.TEST_S3_SECRET_KEY ?? MINIO_PASSWORD,
    smtpUrl: required('TEST_SMTP_URL'),
    mailpitUrl: required('TEST_MAILPIT_URL'),
  };
};

const startContainers = async () => {
  const [postgres, valkey, minio, mailpit] = await Promise.all([
    new PostgreSqlContainer(POSTGRES_IMAGE).withDatabase('pe_test').start(),
    new GenericContainer(VALKEY_IMAGE)
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
      .start(),
    new GenericContainer(MINIO_IMAGE)
      .withExposedPorts(9000)
      .withEnvironment({ MINIO_ROOT_USER: MINIO_USER, MINIO_ROOT_PASSWORD: MINIO_PASSWORD })
      .withCommand(['server', '/data'])
      .withWaitStrategy(Wait.forHttp('/minio/health/live', 9000))
      .start(),
    new GenericContainer(MAILPIT_IMAGE)
      .withExposedPorts(1025, 8025)
      .withEnvironment({ MP_SMTP_AUTH_ACCEPT_ANY: '1', MP_SMTP_AUTH_ALLOW_INSECURE: '1' })
      .withWaitStrategy(Wait.forHttp('/api/v1/info', 8025))
      .start(),
  ]);
  const urls: StackUrls = {
    databaseUrl: postgres.getConnectionUri(),
    valkeyUrl: `redis://${valkey.getHost()}:${valkey.getMappedPort(6379)}`,
    s3Endpoint: `http://${minio.getHost()}:${minio.getMappedPort(9000)}`,
    s3AccessKey: MINIO_USER,
    s3SecretKey: MINIO_PASSWORD,
    smtpUrl: `smtp://${mailpit.getHost()}:${mailpit.getMappedPort(1025)}`,
    mailpitUrl: `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`,
  };
  const containers: readonly (StartedTestContainer | StartedPostgreSqlContainer)[] = [
    postgres,
    valkey,
    minio,
    mailpit,
  ];
  return { urls, containers };
};

const exportUrls = (urls: StackUrls): void => {
  process.env.TEST_DATABASE_URL = urls.databaseUrl;
  process.env.TEST_VALKEY_URL = urls.valkeyUrl;
  process.env.TEST_S3_ENDPOINT = urls.s3Endpoint;
  process.env.TEST_S3_ACCESS_KEY = urls.s3AccessKey;
  process.env.TEST_S3_SECRET_KEY = urls.s3SecretKey;
  process.env.TEST_SMTP_URL = urls.smtpUrl;
  process.env.TEST_MAILPIT_URL = urls.mailpitUrl;
};

/**
 * Vitest globalSetup. Starts Postgres, Valkey, MinIO and Mailpit via Testcontainers, or reuses an
 * already-running stack when TEST_STACK=external (e.g. `docker compose up -d`).
 */
export default async function setup(): Promise<() => Promise<void>> {
  const external = process.env.TEST_STACK === 'external';
  const started = external ? { urls: externalStack(), containers: [] } : await startContainers();
  exportUrls(started.urls);
  await ensureBuckets(started.urls);
  await migrateTestDatabase(started.urls.databaseUrl);
  return async () => {
    await Promise.all(started.containers.map((container) => container.stop()));
  };
}
