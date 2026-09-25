import { Prisma } from '@prisma/client';

import { isCiphertext, type KeyProvider } from '../ports/key-provider';

import { ENCRYPTED_FIELDS, type EncryptedModelSpec } from './encrypted-fields';
import { RELATIONS } from './relations';

type Data = Record<string, unknown>;
type Entry = readonly [string, unknown];

export const isPlainData = (value: unknown): value is Data =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value) &&
  !(value instanceof Prisma.Decimal);

const encryptString = (keys: KeyProvider, value: unknown): unknown =>
  typeof value === 'string' ? keys.encrypt(value) : value;

const decryptString = (keys: KeyProvider, value: unknown): unknown =>
  typeof value === 'string' && isCiphertext(value) ? keys.decrypt(value) : value;

/** Update payloads may wrap scalars as `{ set: value }`. */
const encryptScalar = (keys: KeyProvider, value: unknown): unknown =>
  isPlainData(value) && 'set' in value
    ? { ...value, set: encryptString(keys, value.set) }
    : encryptString(keys, value);

const plainOf = (value: unknown): string | null | undefined => {
  if (isPlainData(value) && 'set' in value) return plainOf(value.set);
  if (typeof value === 'string' || value === null) return value;
  return undefined;
};

const mapJsonKeys = (
  value: unknown,
  paths: readonly string[],
  fn: (v: unknown) => unknown,
): unknown =>
  isPlainData(value)
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, paths.includes(k) ? fn(v) : v]))
    : value;

const mapMaybeArray = <T>(value: unknown, fn: (item: Data) => T): unknown =>
  Array.isArray(value)
    ? value.map((item: unknown) => (isPlainData(item) ? fn(item) : item))
    : isPlainData(value)
      ? fn(value)
      : value;

/** Blind indexes are always derived from the plaintext, overriding anything the caller passed. */
const blindIndexEntries = (keys: KeyProvider, spec: EncryptedModelSpec, data: Data): Entry[] =>
  Object.entries(spec.hmac ?? {}).flatMap(([field, hmacColumn]): Entry[] => {
    if (!(field in data)) return [];
    const plain = plainOf(data[field]);
    if (plain === undefined) return [];
    return [[hmacColumn, plain === null ? null : keys.blindIndex(plain)]];
  });

/** `update` payloads are either the data itself or `{ where, data }` (possibly a list). */
const encryptWritePayload = (keys: KeyProvider, model: string, payload: unknown): unknown =>
  mapMaybeArray(payload, (item) =>
    'data' in item && isPlainData(item.data)
      ? { ...item, data: encryptData(keys, model, item.data) }
      : encryptData(keys, model, item),
  );

const encryptNestedWrite = (keys: KeyProvider, model: string, value: Data): Data =>
  Object.fromEntries(
    Object.entries(value).map(([op, payload]): Entry => {
      switch (op) {
        case 'create':
        case 'update':
        case 'updateMany':
          return [op, encryptWritePayload(keys, model, payload)];
        case 'createMany':
          return [
            op,
            isPlainData(payload)
              ? { ...payload, data: encryptData(keys, model, payload.data) }
              : payload,
          ];
        case 'upsert':
          return [
            op,
            mapMaybeArray(payload, (u) => ({
              ...u,
              create: encryptData(keys, model, u.create),
              update: encryptData(keys, model, u.update),
            })),
          ];
        case 'connectOrCreate':
          return [
            op,
            mapMaybeArray(payload, (c) => ({ ...c, create: encryptData(keys, model, c.create) })),
          ];
        default:
          return [op, payload];
      }
    }),
  );

/** Returns a copy of a write payload with every declared field encrypted, recursing into nested writes. */
export const encryptData = (keys: KeyProvider, model: string, data: unknown): unknown => {
  if (Array.isArray(data)) return data.map((item: unknown) => encryptData(keys, model, item));
  if (!isPlainData(data)) return data;
  const spec = ENCRYPTED_FIELDS[model];
  const relations = RELATIONS[model] ?? {};
  const entries = Object.entries(data).map(([key, value]): Entry => {
    if (spec?.fields.includes(key)) return [key, encryptScalar(keys, value)];
    const jsonPaths = spec?.json?.[key];
    if (jsonPaths !== undefined)
      return [key, mapJsonKeys(value, jsonPaths, (v) => encryptString(keys, v))];
    const relation = relations[key];
    if (relation !== undefined && isPlainData(value))
      return [key, encryptNestedWrite(keys, relation.model, value)];
    return [key, value];
  });
  return Object.fromEntries([
    ...entries,
    ...(spec === undefined ? [] : blindIndexEntries(keys, spec, data)),
  ]);
};

/** Returns a copy of a query result with declared fields decrypted, recursing into included relations. */
export const decryptResult = (keys: KeyProvider, model: string, result: unknown): unknown => {
  if (Array.isArray(result)) return result.map((item: unknown) => decryptResult(keys, model, item));
  if (!isPlainData(result)) return result;
  const spec = ENCRYPTED_FIELDS[model];
  const relations = RELATIONS[model] ?? {};
  return Object.fromEntries(
    Object.entries(result).map(([key, value]): Entry => {
      if (spec?.fields.includes(key)) return [key, decryptString(keys, value)];
      const jsonPaths = spec?.json?.[key];
      if (jsonPaths !== undefined)
        return [key, mapJsonKeys(value, jsonPaths, (v) => decryptString(keys, v))];
      const relation = relations[key];
      if (relation !== undefined && (isPlainData(value) || Array.isArray(value))) {
        return [key, decryptResult(keys, relation.model, value)];
      }
      return [key, value];
    }),
  );
};
