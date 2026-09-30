import { describe, expect, it, vi } from 'vitest';

import { FIXTURES } from './fixtures';

import { sendNow } from './index';
import type { SendNowDeps } from './index';

const makeDeps = (suppressionResult = false): SendNowDeps => ({
  prisma: {
    emailSuppression: {
      findUnique: vi.fn().mockResolvedValue(suppressionResult ? { reason: 'BOUNCE' } : null),
    },
  } as never,
  email: {
    send: vi.fn().mockResolvedValue({ messageId: 'test-message-id' }),
  },
  log: {
    info: vi.fn(),
  },
  keys: {
    blindIndex: vi.fn().mockImplementation((v: string) => `hash:${v}`),
    encrypt: vi.fn().mockImplementation((v: string) => `v1:enc:${v}`),
    decrypt: vi.fn().mockImplementation((v: string) => v.replace(/^v1:enc:/, '')),
  },
});

describe('sendNow', () => {
  it('rejects addresses containing CR+LF (header injection)', async () => {
    const deps = makeDeps();
    await expect(
      sendNow(deps, 'otp', 'attacker@evil.com\r\nBcc: victim@target.com', FIXTURES.otp),
    ).rejects.toThrow('Header injection');
  });

  it('rejects addresses containing LF (header injection)', async () => {
    const deps = makeDeps();
    await expect(
      sendNow(deps, 'otp', 'attacker@evil.com\nBcc: victim@target.com', FIXTURES.otp),
    ).rejects.toThrow('Header injection');
  });

  it('skips send for a suppressed address and returns empty messageId', async () => {
    const deps = makeDeps(true);
    const result = await sendNow(deps, 'otp', 'suppressed@example.com', FIXTURES.otp);
    expect(result.messageId).toBe('');
    expect((deps.email.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('delivers OTP and returns a messageId for a non-suppressed address', async () => {
    const deps = makeDeps(false);
    const result = await sendNow(deps, 'otp', 'user@example.com', FIXTURES.otp);
    expect(result.messageId).toBe('test-message-id');
    expect((deps.email.send as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1);
  });

  it('passes the correct subject and content to EmailPort', async () => {
    const deps = makeDeps(false);
    await sendNow(deps, 'otp', 'user@example.com', FIXTURES.otp);
    const call = (deps.email.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      subject: string;
      to: string;
      html: string;
      text: string;
    };
    expect(call.subject).toBe('Your sign-in code');
    expect(call.to).toBe('user@example.com');
    expect(call.html.length).toBeGreaterThan(0);
    expect(call.text.length).toBeGreaterThan(0);
  });
});
