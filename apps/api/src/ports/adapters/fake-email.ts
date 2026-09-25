import { randomUUID } from 'node:crypto';

import type { EmailMessage, EmailPort } from '../email';

export interface SentEmail extends EmailMessage {
  readonly messageId: string;
  readonly sentAt: Date;
}

/** Test double that records every send; only selectable when NODE_ENV=test (enforced by the env schema). */
export class FakeEmailAdapter implements EmailPort {
  private sent: readonly SentEmail[] = [];

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `<${randomUUID()}@fake.test>`;
    this.sent = [...this.sent, { ...message, messageId, sentAt: new Date() }];
    return { messageId };
  }

  get messages(): readonly SentEmail[] {
    return this.sent;
  }

  lastTo(to: string): SentEmail | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }

  clear(): void {
    this.sent = [];
  }
}
