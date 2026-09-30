import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/format';

interface OrderCardProps {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly totalPaise: number;
  readonly itemCount: number;
  readonly createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'var(--warning)',
  CONFIRMED: 'var(--accent)',
  DISPATCHED: 'var(--accent)',
  IN_TRANSIT: 'var(--accent)',
  DELIVERED: 'var(--success)',
  CANCELLED: 'var(--critical)',
  RETURNED: 'var(--muted)',
};

export function OrderCard({ id, orderNumber, status, totalPaise, itemCount, createdAt }: OrderCardProps) {
  const date = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(createdAt));

  return (
    <Link
      href={`/account/orders/${id}`}
      style={{
        display: 'block',
        padding: 'var(--space-3)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--surface)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color var(--duration-fast) var(--ease-out)',
      }}
      data-testid="order-card"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
        <div>
          <p style={{ fontWeight: '600', fontSize: 'var(--text-small)' }}>{orderNumber}</p>
          <p style={{ color: 'var(--muted)', fontSize: 'var(--text-caption)', marginTop: 'var(--space-1)' }}>{date}</p>
        </div>
        <span
          data-testid="order-status"
          style={{
            fontSize: 'var(--text-caption)',
            fontWeight: '600',
            padding: '2px 8px',
            borderRadius: '999px',
            background: `color-mix(in srgb, ${STATUS_COLORS[status] ?? 'var(--muted)'} 15%, transparent)`,
            color: STATUS_COLORS[status] ?? 'var(--muted)',
          }}
        >
          {status}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)', fontSize: 'var(--text-small)' }}>
        <span style={{ color: 'var(--muted)' }}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
        <span style={{ fontWeight: '600' }}>{formatPrice(totalPaise)}</span>
      </div>
    </Link>
  );
}
