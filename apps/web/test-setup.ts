import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

export const TEST_KID = 'web-test-k1';
export const TEST_PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
export const TEST_PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();
export const TEST_ISSUER = 'puja-essentials-web-test';
export const TEST_WEB_ORIGIN = 'http://localhost:3000';
export const TEST_API_URL = 'http://api.internal:4000';

process.env.API_INTERNAL_URL = TEST_API_URL;
process.env.WEB_ORIGIN = TEST_WEB_ORIGIN;
process.env.REVALIDATE_SECRET = 'web-test-revalidate-secret-0123';
process.env.JWT_ISSUER = TEST_ISSUER;
process.env.JWT_PUBLIC_KEYS_JSON = JSON.stringify([{ kid: TEST_KID, publicPem: TEST_PUBLIC_PEM }]);
