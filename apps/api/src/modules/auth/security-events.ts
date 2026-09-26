import type { FastifyBaseLogger } from 'fastify';

import type { Metrics } from '../../plugins/metrics';

export const SECURITY_EVENTS = [
  'auth.otp.issued',
  'auth.otp.failed',
  'auth.login',
  'auth.login.rejected',
  'auth.refresh.rotated',
  'auth.refresh.reuse_detected',
  'auth.refresh.expired',
  'auth.logout',
  'auth.mfa.enrolled',
  'auth.mfa.failed',
  'auth.step_up',
  'auth.staff.created',
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

export interface SecurityEvents {
  record(event: SecurityEvent, fields?: Readonly<Record<string, unknown>>): void;
}

/** Structured, redacted log line plus a Prometheus counter per event (P03 task 12). */
export const createSecurityEvents = (log: FastifyBaseLogger, metrics: Metrics): SecurityEvents => {
  const counter = metrics.counter('auth_events_total', 'Authentication security events', ['event']);
  return {
    record: (event, fields = {}) => {
      counter.inc({ event });
      log.info({ event, ...fields }, event);
    },
  };
};
