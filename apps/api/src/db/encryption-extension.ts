import { Prisma } from '@prisma/client';

import type { KeyProvider } from '../ports/key-provider';

import { decryptResult, encryptData, isPlainData } from './crypto-walk';

const WRITE_ARG_KEYS = ['data', 'create', 'update'] as const;

const encryptArgs = (keys: KeyProvider, model: string, args: unknown): unknown => {
  if (!isPlainData(args)) return args;
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) =>
      (WRITE_ARG_KEYS as readonly string[]).includes(key)
        ? [key, encryptData(keys, model, value)]
        : [key, value],
    ),
  );
};

/**
 * Transparent field-level encryption (R6). Application code reads and writes plaintext; rows
 * store `v1:` envelopes and blind indexes. Use `prismaRaw` only where ciphertext is intended.
 */
export const createEncryptionExtension = (keys: KeyProvider) =>
  Prisma.defineExtension({
    name: 'field-encryption',
    query: {
      $allModels: {
        async $allOperations({ model, args, query }) {
          const result: unknown = await query(encryptArgs(keys, model, args) as typeof args);
          return decryptResult(keys, model, result);
        },
      },
    },
  });
