import { sharedPlugin } from '../lib/plugin';
import { type CounterEvent, createSecurityCounters } from '../modules/security-events/counters';

const COUNTED_AUTH_EVENTS: ReadonlySet<string> = new Set<CounterEvent>([
  'auth.otp.failed',
  'auth.mfa.failed',
]);

/** Valkey-backed 24 h counters fed by the auth security events (webhook handlers join in later plans). */
export const securityCountersPlugin = sharedPlugin(async (app) => {
  const counters = createSecurityCounters(app.valkey, app.log);
  app.decorate('counters', counters);
  app.auth.events.subscribe((event) => {
    if (COUNTED_AUTH_EVENTS.has(event)) void counters.increment(event as CounterEvent);
  });
});
