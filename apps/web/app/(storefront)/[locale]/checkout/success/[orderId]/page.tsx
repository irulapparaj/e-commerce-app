import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { ButtonLink } from '@/components/ui/Button';
import { Price } from '@/components/ui/Price';
import { ApiError } from '@/lib/api/envelope';
import { apiGet } from '@/lib/api/server';
import type { OrderDetailDto } from '@/lib/api/types';
import { getSession } from '@/lib/auth/session';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Order confirmed',
    robots: { index: false, follow: false },
  };
}

interface SuccessPageProps {
  readonly params: Promise<{ locale: string; orderId: string }>;
}

export default async function OrderSuccessPage({ params }: SuccessPageProps) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);

  const session = await getSession();
  if (session === null || session.aud !== 'storefront') {
    redirect(`/${locale}/login`);
  }

  let order: OrderDetailDto;
  try {
    const result = await apiGet<OrderDetailDto>(`/orders/${orderId}`, { auth: true });
    order = result.data;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }

  // H-18: Guard against rendering "Order confirmed!" for non-PAID orders
  if (order.status === 'CANCELLED' || order.paymentStatus === 'FAILED') {
    redirect(`/${locale}/account`);
  }

  if (order.paymentStatus !== 'PAID') {
    return (
      <div className="mx-auto max-w-2xl px-gutter py-section" data-testid="order-pending">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-warning/10 text-3xl">
            ⏳
          </div>
          <h1 className="text-h1">Payment processing</h1>
          <p className="mt-2 text-muted" data-testid="order-id">Order #{order.orderNumber}</p>
          <p className="mt-1 text-small text-muted">
            Your payment is being processed. We&apos;ll email you once it&apos;s confirmed.
          </p>
        </div>
      </div>
    );
  }

  const { cgst, sgst, igst } = order.tax;
  const hasTax = cgst > 0 || sgst > 0 || igst > 0;

  return (
    <div className="mx-auto max-w-2xl px-gutter py-section" data-testid="order-confirmation">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-accent/10 text-3xl">
          ✓
        </div>
        <h1 className="text-h1">Order confirmed!</h1>
        <p className="mt-2 text-muted" data-testid="order-id">Order #{order.orderNumber}</p>
        <p className="mt-1 text-small text-muted">
          We'll email you when it ships.
        </p>
      </div>

      <div className="rounded-card border border-hairline">
        <div className="border-b border-hairline p-6">
          <h2 className="mb-4 text-h3">Items ordered</h2>
          <ul className="space-y-3">
            {order.items.map((item) => (
              <li key={item.variantId} className="flex justify-between gap-2">
                <span className="text-muted">
                  {item.name}
                  {item.variantLabel !== '' && (
                    <span className="text-small"> · {item.variantLabel}</span>
                  )}
                  {' '}× {item.quantity}
                </span>
                <Price amount={item.lineTotalPaise} size="sm" />
              </li>
            ))}
          </ul>
        </div>

        <div className="border-b border-hairline p-6">
          <h2 className="mb-3 text-h3">Totals</h2>
          <dl className="space-y-2 text-base">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd><Price amount={order.subtotalPaise} size="sm" /></dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Shipping</dt>
              <dd>
                {order.shippingPaise === 0
                  ? <span className="text-accent">Free</span>
                  : formatPrice(order.shippingPaise)}
              </dd>
            </div>
            {hasTax && igst > 0 && (
              <p className="text-small text-muted" data-testid="summary-igst">
                Includes IGST {formatPrice(igst)}
              </p>
            )}
            {hasTax && igst === 0 && (
              <p className="text-small text-muted" data-testid="summary-cgst">
                Includes CGST {formatPrice(cgst)} + SGST {formatPrice(sgst)}
              </p>
            )}
            <div className="flex justify-between border-t border-hairline pt-2 font-semibold">
              <dt>Total</dt>
              <dd><Price amount={order.totalPaise} size="md" /></dd>
            </div>
          </dl>
        </div>

        <div className="p-6">
          <h2 className="mb-3 text-h3">Deliver to</h2>
          <address className="not-italic text-muted">
            <p className="font-medium text-text">{order.address.name}</p>
            <p>{order.address.line1}{order.address.line2 !== null ? `, ${order.address.line2}` : ''}</p>
            <p>{order.address.city}, {order.address.state} — {order.address.pincode}</p>
            <p>{order.address.phone}</p>
          </address>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href={`/${locale}/account`} variant="secondary">
          View all orders
        </ButtonLink>
        <ButtonLink href={`/${locale}`} variant="ghost">
          Continue shopping
        </ButtonLink>
      </div>
    </div>
  );
}
