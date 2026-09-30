import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies a Razorpay payment signature.
 * HMAC-SHA256(`${orderId}|${paymentId}`, secret) must match the provided signature.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string,
): boolean => {
  try {
    const payload = `${orderId}|${paymentId}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
};

/**
 * Verifies a Razorpay webhook signature.
 * HMAC-SHA256(rawBody, secret) must match `X-Razorpay-Signature`.
 */
export const verifyWebhookSignature = (
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean => {
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== signatureBuf.length) return false;
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
};
