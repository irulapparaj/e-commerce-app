import type { ApiEnv } from '@pe/shared';

import { type App, buildApp } from '../../src/app';
import { connectValkey, createValkeyClient } from '../../src/lib/valkey';
import { createPorts, type Ports } from '../../src/ports';
import { FakeEmailAdapter } from '../../src/ports/adapters/fake-email';

import { buildTestEnv } from './env';

export interface TestApp {
  readonly app: App;
  readonly env: ApiEnv;
  readonly ports: Ports;
  readonly email: FakeEmailAdapter | null;
  close(): Promise<void>;
}

export interface TestAppOptions {
  readonly env?: Record<string, string>;
  readonly ports?: Partial<Ports>;
}

/** Builds the real app against the containers started by test/helpers/containers.ts. */
export const buildTestApp = async (options: TestAppOptions = {}): Promise<TestApp> => {
  const env = buildTestEnv(options.env);
  const ports = createPorts(env, options.ports);
  const valkey = createValkeyClient(env.VALKEY_URL);
  await connectValkey(valkey);
  const app = await buildApp({ env, ports, valkey, logger: false });
  await app.ready();
  return {
    app,
    env,
    ports,
    email: ports.email instanceof FakeEmailAdapter ? ports.email : null,
    close: async () => {
      await app.close();
      valkey.disconnect();
    },
  };
};
