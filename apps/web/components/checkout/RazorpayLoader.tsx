'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { getOrder, verifyPayment } from '@/lib/api/checkout';
import type { CreateOrderResult } from '@/lib/api/types';
import { clearIdempotencyKey, rotateIdempotencyKey } from '@/lib/checkout/idempotency';
import { loadRazorpayScript, openRazorpayCheckout } from '@/lib/checkout/razorpay';

import { PaymentFailed } from './PaymentFailed';

interface RazorpayLoaderProps {
  readonly order: CreateOrderResult;
  readonly email: string;
  readonly phone: string;
  readonly locale: string;
  readonly onRetry: () => void;
}

/* eslint-disable-next-line no-restricted-syntax -- fallback when CSS variable unavailable */
const ACCENT_DEFAULT = '#5b21b6';

const getAccentColor = (): string => {
  if (typeof window === 'undefined') return ACCENT_DEFAULT;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  return color !== '' ? color : ACCENT_DEFAULT;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Retry BFF verify up to 3× (1 s → 2 s → 4 s) before giving up.
const VERIFY_MAX_ATTEMPTS = 3;

type LoaderState = 'loading' | 'open' | 'verifying' | 'failed' | 'verify-error';

export function RazorpayLoader({ order, email, phone, locale, onRetry }: RazorpayLoaderProps) {
  const router = useRouter();
  const [state, setState] = useState<LoaderState>('loading');
  // true once Razorpay's handler fires — prevents ondismiss from also showing "failed"
  const verifyingRef = useRef(false);
  const rzpRef = useRef<{ close(): void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        await loadRazorpayScript();
        if (cancelled) return;
        setState('open');

        const handleSuccess = async (paymentId: string, rzpOrderId: string, signature: string) => {
          if (verifyingRef.current) return;
          verifyingRef.current = true;
          // Show "Verifying payment…" spinner; the modal is still open behind it.
          if (!cancelled) setState('verifying');

          let delay = 1_000;
          for (let attempt = 1; attempt <= VERIFY_MAX_ATTEMPTS; attempt++) {
            try {
              await verifyPayment(order.orderId, {
                razorpay_order_id: rzpOrderId,
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
              });
              if (cancelled) return;
              clearIdempotencyKey();
              router.push(`/${locale}/checkout/success/${order.orderId}`);
              return;
            } catch {
              if (attempt < VERIFY_MAX_ATTEMPTS) {
                await sleep(delay);
                if (cancelled) return;
                delay *= 2;
              }
            }
          }
          // Razorpay confirmed payment but BFF is unreachable after all retries.
          // Do NOT rotate the idempotency key — the order exists on Razorpay's side.
          if (!cancelled) setState('verify-error');
        };

        const rzp = openRazorpayCheckout({
          keyId: order.keyId,
          amountPaise: order.amountPaise,
          razorpayOrderId: order.razorpayOrderId,
          name: 'Invita Company',
          email,
          phone,
          accentColor: getAccentColor(),
          onSuccess: (paymentId, rzpOrderId, signature) => {
            void handleSuccess(paymentId, rzpOrderId, signature);
          },
          // Only show "payment failed" if the user closed the modal before paying.
          onDismiss: () => {
            if (!verifyingRef.current) setState('failed');
          },
        });
        rzpRef.current = rzp;
      } catch {
        if (!cancelled) setState('failed');
      }
    };
    void init();
    return () => { cancelled = true; };
  }, [order, email, phone, locale, router]);

  // Poll for order status so payViaStub can trigger navigation without the Razorpay UI.
  useEffect(() => {
    if (state !== 'open') return;
    let active = true;

    const check = async () => {
      if (!active || verifyingRef.current) return;
      try {
        const result = await getOrder(order.orderId);
        if (!active || verifyingRef.current) return;
        const { paymentStatus } = result.data;
        if (paymentStatus === 'PAID') {
          verifyingRef.current = true;
          try { rzpRef.current?.close(); } catch { /* ignore */ }
          clearIdempotencyKey();
          router.push(`/${locale}/checkout/success/${order.orderId}`);
        } else if (paymentStatus === 'FAILED') {
          try { rzpRef.current?.close(); } catch { /* ignore */ }
          setState('failed');
        }
      } catch {
      }
    };

    const id = setInterval(() => { void check(); }, 2_000);
    return () => { active = false; clearInterval(id); };
  }, [state, order.orderId, locale, router]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="size-8 animate-spin rounded-full border-2 border-hairline border-t-accent" />
      </div>
    );
  }

  if (state === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <div className="size-8 animate-spin rounded-full border-2 border-hairline border-t-accent" />
        <p className="text-small text-muted">Verifying payment…</p>
      </div>
    );
  }

  if (state === 'verify-error') {
    return (
      <div
        role="alert"
        data-testid="payment-verify-error"
        className="rounded-card border border-warning/30 bg-warning/5 p-6 text-center"
      >
        <p className="mb-1 text-h3 font-medium text-text">Payment received</p>
        <p className="mb-2 text-small text-muted">
          Your payment was processed but we couldn&apos;t confirm it right now.
          Please contact support and quote your order ID:
        </p>
        <p
          className="mb-4 font-mono text-small font-medium text-text"
          data-testid="razorpay-order-id"
        >
          {order.razorpayOrderId}
        </p>
        <p className="text-small text-muted">Do not try again — your payment was received.</p>
      </div>
    );
  }

  if (state === 'failed') {
    const handleRetry = () => {
      rotateIdempotencyKey();
      onRetry();
    };
    return <PaymentFailed onRetry={handleRetry} />;
  }

  // state === 'open': Razorpay modal is showing. Expose the order UUID for E2E tests.
  return <span data-testid="order-id" className="sr-only">{order.orderId}</span>;
}
