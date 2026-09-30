const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/** Override the injectable clock in the test API. Pass null to reset to wall time. */
export const setClock = async (now: Date | null): Promise<void> => {
  const res = await fetch(`${API_URL}/__test__/clock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ now: now?.toISOString() ?? null }),
  });
  if (!res.ok) throw new Error(`clock hook failed: ${res.status}`);
};

/** Advance the clock by the given number of seconds from the current wall time. */
export const advanceClock = async (seconds: number): Promise<Date> => {
  const now = new Date(Date.now() + seconds * 1_000);
  await setClock(now);
  return now;
};

/** Reset the clock back to wall time. */
export const resetClock = async (): Promise<void> => {
  await setClock(null);
};
