import type { WebhookReconcilePayload } from '../../jobs/queue';

import { type RazorpayEvent, type WebhookHandlerDeps } from './webhook.handlers';
import { processRazorpayEvent } from './webhook.process';

/** Every 10 minutes; catches events whose inline processing and Razorpay retries all failed. */
export const WEBHOOK_RECONCILE_CRON = '*/10 * * * *';
/** Leave freshly-received events to the inline path and Razorpay's own retry ladder first. */
const MIN_AGE_MS = 5 * 60_000;
const BATCH_SIZE = 50;

export interface WebhookReconcileResult {
  readonly trigger: WebhookReconcilePayload['trigger'];
  readonly scanned: number;
  readonly processed: number;
  readonly failed: number;
}

export interface WebhookReconcileDeps extends WebhookHandlerDeps {
  readonly now?: () => Date;
}

const isReplayableEvent = (value: unknown): value is RazorpayEvent =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'string' &&
  typeof (value as { event?: unknown }).event === 'string';

/**
 * Review fix C-1 (reconciliation leg): sweeps unprocessed Razorpay `WebhookEvent` rows and
 * replays them from the stored (sanitized) payload, so a capture is never lost even when the
 * API was down for longer than Razorpay's retry window.
 */
export const runWebhookReconcile = async (
  deps: WebhookReconcileDeps,
  payload: WebhookReconcilePayload,
): Promise<WebhookReconcileResult> => {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await deps.prisma.webhookEvent.findMany({
    where: {
      provider: 'RAZORPAY',
      processedAt: null,
      createdAt: { lt: new Date(now.getTime() - MIN_AGE_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: { externalId: true, payload: true },
  });

  let processed = 0;
  let failed = 0;
  for (const row of rows) {
    if (!isReplayableEvent(row.payload)) {
      failed += 1;
      deps.log.error({ externalId: row.externalId }, 'webhook.reconcile: stored payload not replayable');
      continue;
    }
    const result = await processRazorpayEvent(deps, row.payload);
    if (result.ok) processed += 1;
    else failed += 1;
  }

  const summary: WebhookReconcileResult = {
    trigger: payload.trigger,
    scanned: rows.length,
    processed,
    failed,
  };
  if (rows.length > 0) deps.log.warn(summary, 'webhook.reconcile: replayed unprocessed events');
  return summary;
};
