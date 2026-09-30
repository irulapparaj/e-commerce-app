import { setClock as apiSetClock, resetClock as apiResetClock } from '../helpers/shipping-clock';

/** Thin wrapper exposing the test-clock API as a fixture-like helper. */
export const testClock = {
  /** Override the API clock to a specific instant. */
  set: apiSetClock,
  /** Advance the API clock by N seconds from wall time. */
  advance: async (seconds: number): Promise<Date> => {
    const now = new Date(Date.now() + seconds * 1_000);
    await apiSetClock(now);
    return now;
  },
  /** Reset the API clock back to wall time. */
  reset: apiResetClock,
};
