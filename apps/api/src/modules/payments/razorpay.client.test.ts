import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRazorpayClient } from './razorpay.client';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('createRazorpayClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends X-Razorpay-Idempotency-Key on refunds when provided (C-2)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: 'rfnd_1', payment_id: 'pay_1', amount: 5000, status: 'processed' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createRazorpayClient({ keyId: 'key', keySecret: 'secret' });
    const refund = await client.createRefund('pay_1', 5000, { orderId: 'o1' }, { idempotencyKey: 'rfnd-o1-0' });

    expect(refund.id).toBe('rfnd_1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.razorpay.com/v1/payments/pay_1/refund');
    expect((init.headers as Record<string, string>)['X-Razorpay-Idempotency-Key']).toBe('rfnd-o1-0');
    expect(init.body).toBe(JSON.stringify({ amount: 5000, notes: { orderId: 'o1' } }));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits the idempotency header when no key is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ id: 'rfnd_2', payment_id: 'pay_1', amount: 100, status: 'processed' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createRazorpayClient({ keyId: 'key', keySecret: 'secret' });
    await client.createRefund('pay_1', 100);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty('X-Razorpay-Idempotency-Key');
  });

  it('throws an AppError with the status on non-2xx responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 502 })));
    const client = createRazorpayClient({ keyId: 'key', keySecret: 'secret' });
    await expect(client.fetchPayment('pay_x')).rejects.toThrow('Razorpay API error 502');
  });
});
