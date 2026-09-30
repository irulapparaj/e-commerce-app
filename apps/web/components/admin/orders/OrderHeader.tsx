import { formatDateTime, formatPaise } from '@/lib/admin/format';
import type { OrderDetailDto } from '@/lib/admin/order-types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_TONE,
} from '@/lib/admin/order-types';

interface OrderHeaderProps {
  readonly order: OrderDetailDto;
}

export function OrderHeader({ order }: OrderHeaderProps) {
  return (
    <header className="admin-detail-header">
      <div className="admin-detail-title-row">
        <h1 className="admin-detail-title">{order.orderNumber}</h1>
        <div className="admin-badge-row">
          <span className={ORDER_STATUS_TONE[order.status]} data-testid="order-status-badge">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          <span
            className={PAYMENT_STATUS_TONE[order.paymentStatus]}
            data-testid="payment-status-badge"
          >
            {PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </span>
        </div>
      </div>
      <dl className="admin-meta-grid">
        <dt>Placed</dt>
        <dd data-testid="order-placed-at">{formatDateTime(order.createdAt)}</dd>
        {order.deliveredAt !== null && (
          <>
            <dt>Delivered</dt>
            <dd data-testid="order-delivered-at">{formatDateTime(order.deliveredAt)}</dd>
          </>
        )}
        <dt>Customer</dt>
        <dd data-testid="order-customer-email">{order.maskedEmail}</dd>
        <dt>Phone</dt>
        <dd data-testid="order-customer-phone">{order.maskedPhone}</dd>
        <dt>Total</dt>
        <dd data-testid="order-total" className="font-medium">
          {formatPaise(order.total)}
        </dd>
        {order.razorpayPaymentId !== null && (
          <>
            <dt>Payment ID</dt>
            <dd>
              <code className="admin-code">{order.razorpayPaymentId}</code>
            </dd>
          </>
        )}
        {order.courierName !== null && (
          <>
            <dt>Courier</dt>
            <dd data-testid="order-courier">{order.courierName}</dd>
          </>
        )}
        {order.trackingNumber !== null && (
          <>
            <dt>Tracking</dt>
            <dd>
              {order.trackingUrl !== null ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-link"
                  data-testid="order-tracking-link"
                >
                  {order.trackingNumber}
                </a>
              ) : (
                <code className="admin-code" data-testid="order-tracking-number">
                  {order.trackingNumber}
                </code>
              )}
            </dd>
          </>
        )}
      </dl>
    </header>
  );
}
