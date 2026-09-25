import { brand } from '@pe/shared';

export default function AdminHomePage() {
  return (
    <main className="page" aria-labelledby="admin-heading">
      <h1 id="admin-heading">{brand.name} admin</h1>
      <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
        The admin console arrives with plan P05.
      </p>
    </main>
  );
}
