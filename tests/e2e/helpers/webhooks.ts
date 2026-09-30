const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

export type ShiprocketFixture =
  | 'webhook-shipped'
  | 'webhook-in-transit'
  | 'webhook-delivered'
  | 'webhook-rto'
  | 'assign-awb';

/** Reset the E2E tracking order (WF-11) to PENDING and clear webhook idempotency state. */
export const resetTrackingFixture = async (): Promise<void> => {
  const res = await fetch(`${API_URL}/__test__/fixtures/tracking`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) {
    throw new Error(`Failed to reset tracking fixture: HTTP ${res.status}`);
  }
};

/** Post a Shiprocket webhook fixture in-process via the test hook. */
export const postShiprocketWebhook = async (
  fixture: ShiprocketFixture,
  awb?: string,
): Promise<{ status: number; body: unknown }> => {
  const res = await fetch(`${API_URL}/__test__/webhooks/shiprocket`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fixture, awb }),
  });
  return { status: res.status, body: await res.json() };
};
