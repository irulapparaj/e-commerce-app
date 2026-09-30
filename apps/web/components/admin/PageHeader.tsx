import type { ReactNode } from 'react';

interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="admin-page-header">
      <div>
        <h1 id="page-title" className="admin-page-title">
          {title}
        </h1>
        {description !== undefined && (
          <p className="admin-muted admin-page-description">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="admin-page-actions">{actions}</div>}
    </header>
  );
}
