import type { ObjectStoragePort } from '../../ports/object-storage';
import { EXPORT_KEY_PREFIX } from '../imports/deps';

import { EXPORT_TTL_MS } from './generate.job';

export interface ExpireExportsDeps {
  readonly storage: ObjectStoragePort;
  readonly bucket: string;
  readonly log: { info(obj: object, msg: string): void };
}

export interface ExpireExportsOptions {
  readonly now: Date;
  readonly maxAgeMs?: number;
}

/** Deletes every `exports/` object older than the TTL (P07 task 8; run by the retention job). */
export const expireExports = async (
  deps: ExpireExportsDeps,
  options: ExpireExportsOptions,
): Promise<{ readonly deleted: readonly string[] }> => {
  const cutoff = options.now.getTime() - (options.maxAgeMs ?? EXPORT_TTL_MS);
  const objects = await deps.storage.list({ bucket: deps.bucket, prefix: EXPORT_KEY_PREFIX });
  const expired = objects.filter((object) => object.lastModified.getTime() < cutoff);
  for (const object of expired) await deps.storage.delete({ bucket: deps.bucket, key: object.key });
  deps.log.info({ scanned: objects.length, deleted: expired.length }, 'export files expired');
  return { deleted: expired.map((object) => object.key) };
};
