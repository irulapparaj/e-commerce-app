import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="admin-empty" role="status" data-testid="empty-state">
      <p className="admin-empty-title">{title}</p>
      {description !== undefined && <p className="admin-muted">{description}</p>}
      {action !== undefined && <div className="admin-empty-action">{action}</div>}
    </div>
  );
}
