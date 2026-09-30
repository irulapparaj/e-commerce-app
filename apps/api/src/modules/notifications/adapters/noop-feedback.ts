import type { EmailFeedbackAdapter, FeedbackResult } from '../feedback.port';

/**
 * No-op feedback adapter used until a real provider (SES/SNS, P19) is configured.
 * Always returns null so the webhook route returns 404.
 */
export class NoopFeedbackAdapter implements EmailFeedbackAdapter {
  parse(
    _rawBody: Buffer,
    _headers: Readonly<Record<string, string | string[] | undefined>>,
  ): Promise<FeedbackResult | null> {
    return Promise.resolve(null);
  }
}
