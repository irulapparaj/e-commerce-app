const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export type PaymentOutcome = 'captured' | 'failed';

/** Trigger the Razorpay payment test stub. Returns the stub route's response body. */
export const payViaStub = async (
  orderId: string,
  outcome: PaymentOutcome,
): Promise<Record<string, unknown>> => {
  const res = await fetch(`${API_URL}/api/v1/__test__/payments/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderId, outcome }),
  });
  return res.json() as Promise<Record<string, unknown>>;
};
