import { type ApiEnv, AppError } from '@pe/shared';
import type Redis from 'ioredis';

import type { PrismaRaw } from '../db/prisma';

import { EnvKeyProvider } from './adapters/env-key-provider';
import { FakeEmailAdapter } from './adapters/fake-email';
import { FakeShippingAdapter } from './adapters/fake-shipping';
import { NoopSearchAdapter } from './adapters/noop-search';
import { PostgresSearchAdapter } from './adapters/postgres-search';
import { S3ObjectStorageAdapter } from './adapters/s3-object-storage';
import { ShiprocketAdapter } from './adapters/shiprocket';
import { SmtpEmailAdapter } from './adapters/smtp-email';
import type { EmailPort } from './email';
import type { KeyProvider } from './key-provider';
import type { ObjectStoragePort } from './object-storage';
import type { SearchPort } from './search';
import type { ShippingPort } from './shipping';

export type { EmailMessage, EmailPort } from './email';
export type { KeyProvider } from './key-provider';
export type {
  ObjectStoragePort,
  PresignPutInput,
  PresignedUpload,
  ObjectRef,
  ObjectHead,
} from './object-storage';
export type { SearchPort, SearchQuery, SearchResults, SearchHit, IndexableProduct } from './search';
export type { ShippingPort, Serviceability, Shipment, Tracking, ShipmentAddress } from './shipping';

export interface Ports {
  readonly email: EmailPort;
  readonly storage: ObjectStoragePort;
  readonly keys: KeyProvider;
  readonly shipping: ShippingPort;
  readonly search: SearchPort;
}

const createEmail = (env: ApiEnv): EmailPort =>
  env.EMAIL_ADAPTER === 'fake' ? new FakeEmailAdapter() : SmtpEmailAdapter.fromEnv(env);

const createShipping = (env: ApiEnv, deps: PortDeps): ShippingPort => {
  if (env.SHIPPING_ADAPTER === 'fake') return new FakeShippingAdapter();
  if (env.SHIPPING_ADAPTER === 'shiprocket') {
    if (deps.valkey === undefined) {
      throw new AppError('INTERNAL', 'Shiprocket adapter requires a Valkey client (PortDeps.valkey)');
    }
    return new ShiprocketAdapter({
      SHIPROCKET_BASE_URL: env.SHIPROCKET_BASE_URL ?? 'https://apiv2.shiprocket.in/v1/external',
      SHIPROCKET_EMAIL: env.SHIPROCKET_EMAIL,
      SHIPROCKET_PASSWORD: env.SHIPROCKET_PASSWORD,
      valkey: deps.valkey,
    });
  }
  throw new AppError('INTERNAL', `Unknown SHIPPING_ADAPTER: ${String(env.SHIPPING_ADAPTER)}`);
};

export interface PortDeps {
  /** Required by the Postgres search adapter; the raw client shares the app's connection pool. */
  readonly prismaRaw?: PrismaRaw;
  /** Required by the Shiprocket adapter for token caching. */
  readonly valkey?: Redis;
}

const createSearch = (env: ApiEnv, deps: PortDeps): SearchPort => {
  if (env.SEARCH_ADAPTER === 'noop') return new NoopSearchAdapter();
  if (deps.prismaRaw === undefined) {
    throw new AppError(
      'INTERNAL',
      'Search adapter "postgres" needs a database client (createPorts deps)',
    );
  }
  return new PostgresSearchAdapter(deps.prismaRaw, {
    ...(env.SEARCH_SIMILARITY_THRESHOLD !== undefined && { similarityThreshold: env.SEARCH_SIMILARITY_THRESHOLD }),
  });
};

export const createPorts = (
  env: ApiEnv,
  overrides: Partial<Ports> = {},
  deps: PortDeps = {},
): Ports => ({
  email: overrides.email ?? createEmail(env),
  storage: overrides.storage ?? S3ObjectStorageAdapter.fromEnv(env),
  keys: overrides.keys ?? EnvKeyProvider.fromEnv(env),
  shipping: overrides.shipping ?? createShipping(env, deps),
  search: overrides.search ?? createSearch(env, deps),
});
