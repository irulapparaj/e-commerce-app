import type { FastifyInstance } from 'fastify';

import { runDpdpExport } from '../modules/dpdp/export.job';
import { RETENTION_CRON, runRetention } from '../modules/dpdp/retention.job';
import { runExportGenerate } from '../modules/exports/generate.job';
import { runImportApply } from '../modules/imports/apply.job';
import { importDeps } from '../modules/imports/deps';
import { runImportValidate } from '../modules/imports/validate.job';
import { LEDGER_CHECK_CRON, runLedgerCheck } from '../modules/inventory/ledger-check.job';
import { processMedia } from '../modules/media/process.job';
import { runEmailSend } from '../modules/notifications/send.job';
import { runOrderRelease } from '../modules/orders/release.job';
import {
  runWebhookReconcile,
  WEBHOOK_RECONCILE_CRON,
} from '../modules/payments/webhook.reconcile.job';
import { buildTrackingUrl } from '../modules/shipping/tracking-url';

import { createRevalidateHandler } from './revalidate.job';

/**
 * Registers the in-process workers (P04 task 1). Called once at boot when JOBS_ENABLED=true; a
 * dedicated worker process later is this call in a different entrypoint.
 */
export const registerJobWorkers = async (app: FastifyInstance): Promise<void> => {
  const revalidate = createRevalidateHandler({
    webOrigin: app.env.WEB_ORIGIN,
    secret: app.env.REVALIDATE_SECRET,
    log: app.log,
  });
  await app.jobs.work('media-process', (job) => processMedia(app.media.processDeps, job.data));
  await app.jobs.work('revalidate', (job) => revalidate(job.data));
  await app.jobs.work('ledger-check', (job) =>
    runLedgerCheck({ prisma: app.prisma, counters: app.counters, log: app.log }, job.data),
  );
  await app.jobs.schedule('ledger-check', LEDGER_CHECK_CRON, { trigger: 'cron' });
  const deps = importDeps(app);
  await app.jobs.work('import-validate', (job) => runImportValidate(deps, job.data));
  await app.jobs.work('import-apply', (job) => runImportApply(deps, job.data));
  await app.jobs.work('export-generate', (job) => runExportGenerate(deps, job.data));
  await app.jobs.work('retention', (job) => runRetention(deps, job.data));
  await app.jobs.work('dpdp-export', (job) =>
    runDpdpExport({ ...deps, email: app.ports.email }, job.data),
  );
  await app.jobs.schedule('retention', RETENTION_CRON, { trigger: 'cron' });
  await app.jobs.work('order.release', (job) =>
    runOrderRelease(
      { prisma: app.prisma, jobs: app.jobs, hooks: app.orders.hooks, log: app.log },
      job.data,
    ),
  );
  await app.jobs.work('webhook.reconcile', (job) =>
    runWebhookReconcile(
      { prisma: app.prisma, hooks: app.orders.hooks, log: app.log, razorpay: app.razorpay },
      job.data,
    ),
  );
  await app.jobs.schedule('webhook.reconcile', WEBHOOK_RECONCILE_CRON, { trigger: 'cron' });
  await app.jobs.work('email.send', (job) =>
    runEmailSend(
      { prisma: app.prisma, email: app.ports.email, log: app.log, keys: app.ports.keys },
      job.data,
    ),
  );
  await app.jobs.work('shipping.status.notify', async (job) => {
    const { orderId, orderStatus, awb, courierName, trackingNumber, deliveredAt, rawStatus } =
      job.data;
    if (orderStatus === 'DISPATCHED') {
      const trackingUrl =
        trackingNumber !== null && courierName !== null
          ? buildTrackingUrl(trackingNumber, courierName)
          : null;
      await app.orders.hooks.emitOrderDispatched({
        orderId,
        awb,
        courier: courierName ?? '',
        trackingUrl,
      });
    } else if (orderStatus === 'DELIVERED') {
      await app.orders.hooks.emitOrderDelivered({
        orderId,
        deliveredAt: deliveredAt !== null ? new Date(deliveredAt) : new Date(),
      });
    } else if (orderStatus === 'RETURNED') {
      await app.orders.hooks.emitOrderCancelled({
        orderId,
        userId: '',
        note: `RTO: ${rawStatus}`,
      });
    }
  });
};
