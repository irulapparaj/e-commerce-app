import { randomUUID } from 'node:crypto';

import type { DpdpExportPayload } from '../../jobs/queue';
import type { EmailPort } from '../../ports/email';
import { recordAudit, SYSTEM_ACTOR } from '../audit/record';
import { EXPORT_KEY_PREFIX, type ImportDeps } from '../imports/deps';

import { dataExportReadyEmail } from './emails';
import { exportUserData } from './export.service';

export const DPDP_EXPORT_PREFIX = `${EXPORT_KEY_PREFIX}dpdp/`;
export const DPDP_LINK_TTL_SECONDS = 900;

export interface DpdpExportResult {
  readonly userId: string;
  readonly key: string;
  readonly bytes: number;
  readonly emailed: boolean;
}

export type DpdpExportDeps = Pick<ImportDeps, 'prisma' | 'storage' | 'bucket' | 'log' | 'now'> & {
  readonly email: EmailPort;
};

/**
 * `dpdp-export` job (P08 task 6): JSON under `exports/dpdp/` (swept with the other exports after
 * 24 h), then a "your export is ready" email with a 15-minute link. Shared with self-service (P15).
 */
export const runDpdpExport = async (
  deps: DpdpExportDeps,
  payload: DpdpExportPayload,
): Promise<DpdpExportResult> => {
  const data = await exportUserData(deps.prisma, payload.userId, deps.now);
  const key = `${DPDP_EXPORT_PREFIX}${payload.userId}-${randomUUID()}.json`;
  const body = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
  await deps.storage.put({ bucket: deps.bucket, key, body, contentType: 'application/json' });
  const { url } = await deps.storage.presignGet({
    bucket: deps.bucket,
    key,
    expiresSec: DPDP_LINK_TTL_SECONDS,
  });
  await deps.email.send({
    to: data.profile.email,
    ...dataExportReadyEmail(data.profile.name, url),
  });
  await recordAudit(deps.prisma, {
    ...SYSTEM_ACTOR,
    action: 'customer.dpdp_export_generated',
    entityType: 'user',
    entityId: payload.userId,
    after: { key, bytes: body.length, requestedBy: payload.requestedBy, actorId: payload.actorId },
  });
  deps.log.info({ userId: payload.userId, key }, 'dpdp export generated');
  return { userId: payload.userId, key, bytes: body.length, emailed: true };
};
