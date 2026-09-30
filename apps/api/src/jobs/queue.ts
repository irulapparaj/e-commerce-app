export const JOB_NAMES = [
  'media-process',
  'revalidate',
  'ledger-check',
  'import-validate',
  'import-apply',
  'export-generate',
  'dpdp-export',
  'retention',
  'order.release',
  'email.order-cancelled',
  'email.send',
  'shipping.status.notify',
  'webhook.reconcile',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export type MediaTarget =
  | { readonly kind: 'product'; readonly productId: string; readonly alt: string }
  | { readonly kind: 'category'; readonly categoryId: string };

export interface MediaProcessPayload {
  readonly key: string;
  readonly target: MediaTarget;
}

export interface RevalidatePayload {
  readonly tags: readonly string[];
}

export interface LedgerCheckPayload {
  readonly trigger: 'cron' | 'manual';
  readonly actorId?: string;
}

export interface ImportValidatePayload {
  readonly jobId: string;
}

export interface ImportApplyPayload {
  readonly jobId: string;
  readonly actorId: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export const EXPORT_TYPES = ['products', 'orders', 'customers'] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

export interface ExportGeneratePayload {
  readonly type: ExportType;
  readonly actorId: string;
  /** Orders/customers only: include names, addresses and contact details (audited with the reason). */
  readonly full: boolean;
}

export interface DpdpExportPayload {
  readonly userId: string;
  readonly requestedBy: 'ADMIN' | 'SELF';
  readonly actorId: string | null;
}

export interface RetentionPayload {
  readonly trigger: 'cron' | 'manual';
}

export interface WebhookReconcilePayload {
  readonly trigger: 'cron' | 'manual';
}

export interface OrderReleasePayload {
  readonly orderId: string;
}

export interface EmailOrderCancelledPayload {
  readonly orderId: string;
}

export interface EmailSendPayload {
  readonly name: string;
  readonly to: string;
  readonly data: Record<string, unknown>;
  readonly locale: string;
  readonly dedupeKey?: string;
}

export interface ShippingStatusNotifyPayload {
  readonly orderId: string;
  /** Maps to OrderStatus values: DISPATCHED, DELIVERED, RETURNED. */
  readonly orderStatus: string;
  readonly awb: string;
  readonly courierName: string | null;
  readonly trackingNumber: string | null;
  /** ISO date string; present when orderStatus is DELIVERED. */
  readonly deliveredAt: string | null;
  readonly rawStatus: string;
}

export interface JobPayloads {
  readonly 'media-process': MediaProcessPayload;
  readonly revalidate: RevalidatePayload;
  readonly 'ledger-check': LedgerCheckPayload;
  readonly 'import-validate': ImportValidatePayload;
  readonly 'import-apply': ImportApplyPayload;
  readonly 'export-generate': ExportGeneratePayload;
  readonly 'dpdp-export': DpdpExportPayload;
  readonly retention: RetentionPayload;
  readonly 'order.release': OrderReleasePayload;
  readonly 'email.order-cancelled': EmailOrderCancelledPayload;
  readonly 'email.send': EmailSendPayload;
  readonly 'shipping.status.notify': ShippingStatusNotifyPayload;
  readonly 'webhook.reconcile': WebhookReconcilePayload;
}

export type JobState = 'created' | 'retry' | 'active' | 'completed' | 'cancelled' | 'failed';

export interface JobStatus {
  readonly id: string;
  readonly name: string;
  readonly state: JobState;
  /** The payload the job was enqueued with; routes use it to scope who may read the result. */
  readonly data: unknown;
  readonly error: string | null;
  readonly output: unknown;
  readonly createdOn: Date;
  readonly completedOn: Date | null;
}

export interface JobContext<N extends JobName> {
  readonly id: string;
  readonly data: JobPayloads[N];
}

export type JobHandler<N extends JobName> = (job: JobContext<N>) => Promise<unknown>;

export interface SendOptions {
  /** pg-boss `startAfter` interval string, e.g. '30 minutes' */
  readonly startAfter?: string;
  /** pg-boss singleton key for de-duplication: only one job with this key will be queued at a time. */
  readonly singletonKey?: string;
}

/**
 * The queue abstraction every service enqueues through. pg-boss implements it in production and in
 * integration tests (the same Postgres); nothing else in the codebase imports pg-boss directly.
 */
export interface JobQueue {
  send<N extends JobName>(name: N, data: JobPayloads[N], options?: SendOptions): Promise<string | null>;
  getJob(name: JobName, id: string): Promise<JobStatus | null>;
  work<N extends JobName>(name: N, handler: JobHandler<N>): Promise<void>;
  schedule<N extends JobName>(name: N, cron: string, data: JobPayloads[N]): Promise<void>;
  stop(): Promise<void>;
}
