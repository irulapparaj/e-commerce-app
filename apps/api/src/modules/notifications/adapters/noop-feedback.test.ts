import { describe, expect, it } from 'vitest';

import { NoopFeedbackAdapter } from './noop-feedback';

describe('NoopFeedbackAdapter', () => {
  it('always returns null regardless of input', async () => {
    const adapter = new NoopFeedbackAdapter();
    const result = await adapter.parse(Buffer.from('{}'), {
      'content-type': 'application/json',
    });
    expect(result).toBeNull();
  });

  it('returns null even with empty body', async () => {
    const adapter = new NoopFeedbackAdapter();
    const result = await adapter.parse(Buffer.alloc(0), {});
    expect(result).toBeNull();
  });
});
