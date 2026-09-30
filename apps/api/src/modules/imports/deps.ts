import { createHash } from 'node:crypto';

import { AppError } from '@pe/shared';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';

import type { PrismaDb } from '../../db/prisma';
import type { JobQueue } from '../../jobs/queue';
import type { KeyProvider } from '../../ports/key-provider';
import type { ObjectStoragePort } from '../../ports/object-storage';
import type { RevalidateNotifier } from '../revalidate/notify';

export interface ImportDeps {
  readonly prisma: PrismaDb;
  readonly storage: ObjectStoragePort;
  /** `S3_BUCKET_IMPORTS`: uploads under `imports/`, generated files under `exports/`. */
  readonly bucket: string;
  readonly jobs: JobQueue;
  readonly revalidate: RevalidateNotifier;
  readonly log: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>;
  readonly now: () => Date;
  readonly keys: KeyProvider;
}

export const IMPORT_KEY_PREFIX = 'imports/';
export const EXPORT_KEY_PREFIX = 'exports/';

export const importDeps = (
  app: FastifyInstance,
  now: () => Date = () => new Date(),
): ImportDeps => ({
  prisma: app.prisma,
  storage: app.ports.storage,
  bucket: app.env.S3_BUCKET_IMPORTS,
  jobs: app.jobs,
  revalidate: app.revalidate,
  log: app.log,
  now,
  keys: app.ports.keys,
});

/** Buffers an object with a hard byte cap so a swapped 100 MB upload cannot exhaust memory. */
export const readObject = async (
  deps: Pick<ImportDeps, 'storage' | 'bucket'>,
  key: string,
  maxBytes: number,
): Promise<Buffer> => {
  const head = await deps.storage.head({ bucket: deps.bucket, key });
  if (!head.exists) throw new AppError('NOT_FOUND', 'Upload not found; complete the PUT first');
  if (head.size !== undefined && head.size > maxBytes)
    throw new AppError('VALIDATION', `File exceeds ${maxBytes} bytes`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of await deps.storage.getStream({ bucket: deps.bucket, key })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > maxBytes) throw new AppError('VALIDATION', `File exceeds ${maxBytes} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

export const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
