/**
 * Thin helpers for direct database assertions in E2E tests.
 * Uses the test-hook API rather than a live database connection so tests
 * stay portable across the compose stack.
 */

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Truncate all transactional tables and re-run the full seed. */
export const resetDatabase = async (): Promise<void> => {
  const res = await fetch(`${API_URL}/__test__/reset`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`reset hook failed ${res.status}: ${body}`);
  }
};

/** Trigger a pending pg-boss job by name and return its id. */
export const runJob = async (name: string): Promise<string> => {
  const res = await fetch(`${API_URL}/__test__/jobs/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as { id?: string; error?: string };
  if (!res.ok) throw new Error(`run-job hook failed ${res.status}: ${body.error ?? ''}`);
  return body.id ?? '';
};
