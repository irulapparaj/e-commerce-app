import { AppError } from '@pe/shared';

const RAZORPAY_BASE_URL = 'https://api.razorpay.com/v1';
/** Below the refund transaction budget so a hung call can never outlive the row lock. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface RazorpayOrder {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly receipt: string;
  readonly status: string;
}

export interface RazorpayPayment {
  readonly id: string;
  readonly status: string;
  readonly amount: number;
  readonly order_id: string;
}

const buildAuthHeader = (keyId: string, keySecret: string): string => {
  const encoded = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${encoded}`;
};

const request = async <T>(
  method: string,
  path: string,
  keyId: string,
  keySecret: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> => {
  const response = await fetch(`${RAZORPAY_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: buildAuthHeader(keyId, keySecret),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new AppError('INTERNAL', `Razorpay API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
};

export interface RazorpayRefund {
  readonly id: string;
  readonly payment_id: string;
  readonly amount: number;
  readonly status: string;
}

export interface RazorpayClientDeps {
  readonly keyId: string;
  readonly keySecret: string;
}

export const createRazorpayClient = ({ keyId, keySecret }: RazorpayClientDeps) => {
  const createOrder = (
    amount: number,
    currency: 'INR',
    receipt: string,
    notes: Record<string, string>,
  ): Promise<RazorpayOrder> =>
    request<RazorpayOrder>('POST', '/orders', keyId, keySecret, {
      amount,
      currency,
      receipt,
      notes,
    });

  const fetchPayment = (paymentId: string): Promise<RazorpayPayment> =>
    request<RazorpayPayment>('GET', `/payments/${paymentId}`, keyId, keySecret);

  /**
   * `idempotencyKey` makes a retry after an ambiguous failure (timeout, dropped connection)
   * safe: Razorpay replays the original refund instead of creating a second one (C-2).
   */
  const createRefund = (
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string> = {},
    options: { readonly idempotencyKey?: string } = {},
  ): Promise<RazorpayRefund> =>
    request<RazorpayRefund>(
      'POST',
      `/payments/${paymentId}/refund`,
      keyId,
      keySecret,
      { amount: amountPaise, notes },
      options.idempotencyKey === undefined
        ? undefined
        : { 'X-Razorpay-Idempotency-Key': options.idempotencyKey },
    );

  return { createOrder, fetchPayment, createRefund };
};

export type RazorpayClient = ReturnType<typeof createRazorpayClient>;
