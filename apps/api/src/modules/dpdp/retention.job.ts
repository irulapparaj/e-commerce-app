import type { RetentionPayload } from '../../jobs/queue';
import { recordAudit, SYSTEM_ACTOR } from '../audit/record';
import { expireExports } from '../exports/expire';
import type { ImportDeps } from '../imports/deps';

/** 02:30 IST daily, after the ledger check (P08 task 8). */
export const RETENTION_CRON = '0 21 * * *';
/** DESIGN §11.3: refresh tokens are kept 30 d; expired ones linger a week for incident forensics. */
export const REFRESH_TOKEN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
/** Review fix C-4: webhook payloads had no retention policy; 90 d covers dispute windows. */
export const WEBHOOK_EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export interface RetentionResult {
  readonly trigger: RetentionPayload['trigger'];
  readonly exportsDeleted: number;
  readonly refreshTokensDeleted: number;
  readonly webhookEventsDeleted: number;
}

export type RetentionDeps = Pick<ImportDeps, 'prisma' | 'storage' | 'bucket' | 'log' | 'now'>;

/**
 * `retention` job: one daily sweep that later plans extend (return photos, logs). Today it deletes
 * export files older than 24 h (P07) and refresh tokens a week past expiry.
 */
export const runRetention = async (
  deps: RetentionDeps,
  payload: RetentionPayload,
): Promise<RetentionResult> => {
  const now = deps.now();
  const exports = await expireExports(deps, { now });
  const tokens = await deps.prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - REFRESH_TOKEN_GRACE_MS) } },
  });
  const webhookEvents = await deps.prisma.webhookEvent.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - WEBHOOK_EVENT_RETENTION_MS) } },
  });
  const result: RetentionResult = {
    trigger: payload.trigger,
    exportsDeleted: exports.deleted.length,
    refreshTokensDeleted: tokens.count,
    webhookEventsDeleted: webhookEvents.count,
  };
  await recordAudit(deps.prisma, {
    ...SYSTEM_ACTOR,
    action: 'retention.ran',
    entityType: 'retention',
    after: { ...result, exportKeys: exports.deleted },
  });
  deps.log.info(result, 'retention sweep complete');
  return result;
};
