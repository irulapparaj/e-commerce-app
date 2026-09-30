export type FeedbackEventType = 'BOUNCE' | 'COMPLAINT';

export interface FeedbackEvent {
  readonly emailHash: string;
  readonly type: FeedbackEventType;
  /** true = permanent; false = transient (soft bounce — do not suppress) */
  readonly hard: boolean;
}

export interface FeedbackResult {
  readonly events: readonly FeedbackEvent[];
}

/**
 * Adapter interface for inbound email feedback (bounces, complaints).
 * Implementations handle provider-specific signature verification and payload parsing.
 * Returning null means the adapter cannot handle this request (→ 404).
 */
export interface EmailFeedbackAdapter {
  parse(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<FeedbackResult | null>;
}
