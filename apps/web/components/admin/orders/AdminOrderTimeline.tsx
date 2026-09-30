import { formatDateTime } from '@/lib/admin/format';
import type { OrderTimelineEvent } from '@/lib/admin/order-types';
import { ORDER_STATUS_LABELS } from '@/lib/admin/order-types';

interface AdminOrderTimelineProps {
  readonly events: readonly OrderTimelineEvent[];
}

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  SYSTEM: 'System',
  ADMIN: 'Admin',
  WEBHOOK: 'Courier',
};

export function AdminOrderTimeline({ events }: AdminOrderTimelineProps) {
  if (events.length === 0) {
    return (
      <section aria-labelledby="order-timeline-heading">
        <h2 id="order-timeline-heading" className="admin-section-heading">
          Timeline
        </h2>
        <p className="admin-muted">No events yet.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="order-timeline-heading">
      <h2 id="order-timeline-heading" className="admin-section-heading">
        Timeline
      </h2>
      <ol className="admin-timeline" data-testid="order-timeline">
        {[...events].reverse().map((event, index) => (
          <li key={index} className="admin-timeline-item" data-testid="order-timeline-event">
            <div className="admin-timeline-dot" aria-hidden="true" />
            <div className="admin-timeline-content">
              <div className="admin-timeline-label">
                <span className="font-medium">{ORDER_STATUS_LABELS[event.status]}</span>
                <span className="admin-muted text-sm">
                  {' '}
                  via {SOURCE_LABEL[event.source] ?? event.source}
                </span>
              </div>
              <time className="admin-muted text-sm" dateTime={event.at}>
                {formatDateTime(event.at)}
              </time>
              {event.note !== undefined && event.note !== '' && (
                <p className="admin-timeline-note text-sm">{event.note}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
