import { type ApiEnv, AppError } from '@pe/shared';

import { EnvKeyProvider } from './adapters/env-key-provider';
import { FakeEmailAdapter } from './adapters/fake-email';
import { FakeShippingAdapter } from './adapters/fake-shipping';
import { NoopSearchAdapter } from './adapters/noop-search';
import { S3ObjectStorageAdapter } from './adapters/s3-object-storage';
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

const createShipping = (env: ApiEnv): ShippingPort => {
  if (env.SHIPPING_ADAPTER === 'fake') return new FakeShippingAdapter();
  throw new AppError(
    'INTERNAL',
    'Shipping adapter "shiprocket" is not available in this build (arrives in P14)',
  );
};

const createSearch = (env: ApiEnv): SearchPort => {
  if (env.SEARCH_ADAPTER === 'noop') return new NoopSearchAdapter();
  throw new AppError(
    'INTERNAL',
    'Search adapter "postgres" is not available in this build (arrives in P04)',
  );
};

export const createPorts = (env: ApiEnv, overrides: Partial<Ports> = {}): Ports => ({
  email: overrides.email ?? createEmail(env),
  storage: overrides.storage ?? S3ObjectStorageAdapter.fromEnv(env),
  keys: overrides.keys ?? EnvKeyProvider.fromEnv(env),
  shipping: overrides.shipping ?? createShipping(env),
  search: overrides.search ?? createSearch(env),
});
