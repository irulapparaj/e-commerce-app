interface TimelineEvent {
  readonly status: string;
  readonly note: string | null;
  readonly createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Order confirmed',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

const IST_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

interface OrderTimelineProps {
  readonly events: readonly TimelineEvent[];
}

export function OrderTimeline({ events }: OrderTimelineProps) {
  if (events.length === 0) return null;

  return (
    <ol
      aria-label="Order timeline"
      role="list"
      style={{ listStyle: 'none', padding: 0, margin: 0 }}
      data-testid="order-timeline"
    >
      {events.map((event, idx) => (
        <li
          key={`${event.status}-${event.createdAt}`}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            position: 'relative',
            paddingBottom: idx < events.length - 1 ? 'var(--space-3)' : 0,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: idx === events.length - 1 ? 'var(--accent)' : 'var(--hairline)',
              marginTop: '5px',
              position: 'relative',
              zIndex: 1,
            }}
            aria-hidden="true"
          />
          {idx < events.length - 1 && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '4px',
                top: '15px',
                bottom: 0,
                width: '2px',
                background: 'var(--hairline)',
              }}
            />
          )}
          <div>
            <p style={{ fontWeight: '600', fontSize: 'var(--text-small)' }}>
              {STATUS_LABELS[event.status] ?? event.status}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 'var(--text-caption)', marginTop: '2px' }}>
              {IST_FORMATTER.format(new Date(event.createdAt))}
            </p>
            {event.note !== null && (
              <p style={{ fontSize: 'var(--text-caption)', marginTop: '2px' }}>{event.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
