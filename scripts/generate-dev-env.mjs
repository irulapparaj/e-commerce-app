#!/usr/bin/env node
// Writes a .env for local development from .env.example, filling in fresh random keys.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const target = resolve(root, process.argv[2] ?? '.env');

if (existsSync(target) && !process.argv.includes('--force')) {
  console.error(`${target} already exists; pass --force to overwrite`);
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = `k${Date.now().toString(36)}`;

const generated = {
  ENCRYPTION_KEY_B64: randomBytes(32).toString('base64'),
  BLIND_INDEX_KEY_B64: randomBytes(32).toString('base64'),
  JWT_ACTIVE_KID: kid,
  JWT_KEYS_JSON: JSON.stringify([{ kid, privatePem, publicPem }]),
  JWT_PUBLIC_KEYS_JSON: JSON.stringify([{ kid, publicPem }]),
  REVALIDATE_SECRET: randomBytes(24).toString('base64url'),
  HMAC_SECRET: randomBytes(32).toString('hex'),
};

const lines = readFileSync(resolve(root, '.env.example'), 'utf8')
  .split('\n')
  .map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;
    const key = match[1];
    if (!(key in generated)) return line;
    return `${key}=${generated[key]}`;
  });

writeFileSync(target, `${lines.join('\n')}\n`, { mode: 0o600 });
console.log(`wrote ${target}`);
