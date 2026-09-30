import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

import { OrderTimeline } from '@/components/account/OrderTimeline';
import { TrackingLink } from '@/components/account/TrackingLink';
import { isApiError } from '@/lib/api/envelope';
import { apiGet } from '@/lib/api/server';
import { formatPrice } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface OrderDetailPageProps {
  readonly params: Promise<{ locale: string; id: string }>;
}

export async function generateMetadata({ params }: OrderDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Order ${id.slice(0, 8).toUpperCase()}` };
}

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata',
});

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  let order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    subtotalPaise: number;
    shippingPaise: number;
    discountPaise: number;
    tax: { cgst: number; sgst: number; igst: number };
    totalPaise: number;
    createdAt: string;
    items: Array<{ id: string; name: string; variantLabel: string; sku: string; unitPricePaise: number; quantity: number }>;
    address: { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
    timeline: Array<{ status: string; note: string | null; createdAt: string }>;
    tracking: { awb: string | null; courier: string | null; url: string | null };
  };

  try {
    const result = await apiGet<typeof order>(`/orders/${id}`, { auth: true });
    order = result.data;
  } catch (err) {
    if (isApiError(err) && err.status === 404) notFound();
    throw err;
  }

  const taxTotal = order.tax.cgst + order.tax.sgst + order.tax.igst;
  const isIgst = order.tax.igst > 0;

  return (
    <article aria-labelledby="order-heading">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        <div>
          <h2 id="order-heading" style={{ fontSize: 'var(--text-h3)' }}>
            Order {order.orderNumber}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-small)', marginTop: '4px' }}>
            Placed {IST_FORMATTER.format(new Date(order.createdAt))}
          </p>
        </div>
        {order.tracking.url !== null && (
          <TrackingLink url={order.tracking.url} awb={order.tracking.awb} />
        )}
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-5)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <section aria-labelledby="items-heading">
          <h3 id="items-heading" style={{ fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-2)', color: 'var(--muted)' }}>Items</h3>
          <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {order.items.map((item) => (
              <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)', fontSize: 'var(--text-small)' }}>
                <div>
                  <p style={{ fontWeight: '600' }}>{item.name}</p>
                  <p style={{ color: 'var(--muted)' }}>{item.variantLabel} × {item.quantity}</p>
                </div>
                <p style={{ fontWeight: '600', flexShrink: 0 }}>{formatPrice(item.unitPricePaise * item.quantity)}</p>
              </li>
            ))}
          </ul>

          <dl style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-3)', fontSize: 'var(--text-small)', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt style={{ color: 'var(--muted)' }}>Subtotal</dt>
              <dd>{formatPrice(order.subtotalPaise)}</dd>
            </div>
            {order.shippingPaise > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ color: 'var(--muted)' }}>Shipping</dt>
                <dd>{formatPrice(order.shippingPaise)}</dd>
              </div>
            )}
            {order.discountPaise > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ color: 'var(--muted)' }}>Discount</dt>
                <dd style={{ color: 'var(--success)' }}>−{formatPrice(order.discountPaise)}</dd>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
              <dt>Total</dt>
              <dd>{formatPrice(order.totalPaise)}</dd>
            </div>
            {taxTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <dt style={{ color: 'var(--muted)', fontSize: 'var(--text-caption)' }}>
                  {isIgst ? 'Includes IGST' : 'Includes CGST + SGST'}
                </dt>
                <dd style={{ color: 'var(--muted)', fontSize: 'var(--text-caption)' }}>{formatPrice(taxTotal)}</dd>
              </div>
            )}
          </dl>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <section aria-labelledby="timeline-heading">
            <h3 id="timeline-heading" style={{ fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-2)', color: 'var(--muted)' }}>Timeline</h3>
            <OrderTimeline events={order.timeline} />
          </section>

          <section aria-labelledby="shipping-heading">
            <h3 id="shipping-heading" style={{ fontSize: 'var(--text-small)', fontWeight: '600', marginBottom: 'var(--space-2)', color: 'var(--muted)' }}>Shipping address</h3>
            <address style={{ fontStyle: 'normal', fontSize: 'var(--text-small)', lineHeight: 1.6 }}>
              <p>{order.address.name}</p>
              <p>{order.address.phone}</p>
              <p>{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ''}</p>
              <p>{order.address.city}, {order.address.state} — {order.address.pincode}</p>
            </address>
          </section>

          <a
            href={`/pages/contact?subject=Order+${order.orderNumber}`}
            style={{ fontSize: 'var(--text-small)', color: 'var(--accent)', textDecoration: 'underline' }}
          >
            Need help with this order?
          </a>
        </div>
      </div>
    </article>
  );
}
