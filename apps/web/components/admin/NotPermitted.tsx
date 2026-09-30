import Link from 'next/link';

interface NotPermittedProps {
  readonly role?: string | null | undefined;
}

/** UX only: the API already refused or would refuse; never rely on this for enforcement. */
export function NotPermitted({ role }: NotPermittedProps) {
  return (
    <section className="admin-not-permitted" role="alert" data-testid="not-permitted">
      <h1 className="admin-page-title">Not permitted</h1>
      <p className="admin-muted">
        {role === undefined || role === null
          ? 'Your account cannot open this page.'
          : `Your role (${role}) cannot open this page.`}{' '}
        Ask an administrator if you need access.
      </p>
      <Link href="/admin" className="admin-btn">
        Back to dashboard
      </Link>
    </section>
  );
}
