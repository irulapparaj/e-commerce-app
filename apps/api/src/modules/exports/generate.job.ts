import { randomUUID } from 'node:crypto';

import type { ExportGeneratePayload, ExportType } from '../../jobs/queue';
import { recordAudit, SYSTEM_ACTOR } from '../audit/record';
import { EXPORT_KEY_PREFIX, type ImportDeps } from '../imports/deps';

import { buildCustomersExport } from './customers.export';
import { buildOrdersExport } from './orders.export';
import { buildProductsExport, type ExportDocument } from './products.export';

export interface ExportGenerateResult {
  readonly type: ExportType;
  readonly key: string;
  readonly rows: number;
  readonly bytes: number;
  readonly expiresAt: string;
}

/** DESIGN §11.3: export files expire after 24 h (the retention job deletes them). */
export const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;
const CSV_TYPE = 'text/csv; charset=utf-8';

export type ExportDeps = Pick<ImportDeps, 'prisma' | 'storage' | 'bucket' | 'log' | 'now' | 'keys'>;

export const exportKeyFor = (type: ExportType): string =>
  `${EXPORT_KEY_PREFIX}${type}-${randomUUID()}.csv`;

const build = (deps: ExportDeps, payload: ExportGeneratePayload): Promise<ExportDocument> => {
  switch (payload.type) {
    case 'products':
      return buildProductsExport(deps.prisma);
    case 'orders':
      return buildOrdersExport(deps.prisma, { full: payload.full });
    case 'customers':
      return buildCustomersExport(deps.prisma, deps.keys, { full: payload.full });
  }
};

/** `export-generate` job (P07 task 8): build the CSV, store it under `exports/`, audit the file. */
export const runExportGenerate = async (
  deps: ExportDeps,
  payload: ExportGeneratePayload,
): Promise<ExportGenerateResult> => {
  const document = await build(deps, payload);
  const key = exportKeyFor(payload.type);
  const body = Buffer.from(document.csv, 'utf8');
  await deps.storage.put({ bucket: deps.bucket, key, body, contentType: CSV_TYPE });
  const result: ExportGenerateResult = {
    type: payload.type,
    key,
    rows: document.rows,
    bytes: body.length,
    expiresAt: new Date(deps.now().getTime() + EXPORT_TTL_MS).toISOString(),
  };
  await recordAudit(deps.prisma, {
    ...SYSTEM_ACTOR,
    action: 'export.generated',
    entityType: 'export',
    entityId: key,
    after: { ...result, requestedBy: payload.actorId, full: payload.full },
  });
  deps.log.info({ type: payload.type, key, rows: document.rows }, 'export generated');
  return result;
};
