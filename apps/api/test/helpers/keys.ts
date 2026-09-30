import { generateKeyPairSync } from 'node:crypto';

export interface TestKeyPair {
  readonly kid: string;
  readonly privatePem: string;
  readonly publicPem: string;
}

const MODULUS_LENGTH = 2048;

/** Test-only RSA keys generated per process so no private key is ever committed. */
export const generateTestKeyPair = (kid: string): TestKeyPair => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: MODULUS_LENGTH });
  return {
    kid,
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
};

let cached: readonly TestKeyPair[] | undefined;

export const testKeyPairs = (): readonly TestKeyPair[] => {
  cached ??= [generateTestKeyPair('test-k1'), generateTestKeyPair('test-k2')];
  return cached;
};
