import { handleRazorpayEvent, type RazorpayEvent, type WebhookHandlerDeps } from './webhook.handlers';

export type WebhookProcessResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

/**
 * Review fix C-1: webhook processing used to be fire-and-forget — a transient handler failure
 * permanently dropped the event because the dedupe row already existed and every retry got 200.
 *
 * This runs the handler to completion and records the outcome on the `WebhookEvent` row:
 * success stamps `processedAt`; failure stores the error and leaves the row unprocessed so both
 * Razorpay's retries (route returns 500) and the reconcile sweep can pick it up again.
 */
export const processRazorpayEvent = async (
  deps: WebhookHandlerDeps,
  event: RazorpayEvent,
): Promise<WebhookProcessResult> => {
  try {
    await handleRazorpayEvent(deps, event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.log.error({ err, eventId: event.id }, 'razorpay webhook processing failed; will retry');
    await deps.prisma.webhookEvent
      .updateMany({
        where: { provider: 'RAZORPAY', externalId: event.id },
        data: { error: message },
      })
      .catch((updateErr: unknown) => {
        deps.log.error({ err: updateErr, eventId: event.id }, 'failed to record webhook error');
      });
    return { ok: false, error: message };
  }

  await deps.prisma.webhookEvent.updateMany({
    where: { provider: 'RAZORPAY', externalId: event.id },
    data: { processedAt: new Date(), error: null },
  });
  return { ok: true };
};
