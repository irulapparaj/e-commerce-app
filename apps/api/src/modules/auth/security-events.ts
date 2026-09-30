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
  'auth.staff.role_changed',
  'auth.staff.mfa_reset',
  'auth.staff.sessions_revoked',
  'auth.session.revoked',
  'customer.pii.revealed',
  'customer.pii.read',
  'customer.disabled',
  'customer.enabled',
  'customer.erased',
  'customer.session.revoked',
  'auth.reauth.otp.issued',
  'auth.reauth.failed',
  'auth.reauth.success',
  'account.export.requested',
  'account.deleted',
] as const;

export type SecurityEvent = (typeof SECURITY_EVENTS)[number];

export type SecurityEventListener = (
  event: SecurityEvent,
  fields: Readonly<Record<string, unknown>>,
) => void;

export interface SecurityEvents {
  record(event: SecurityEvent, fields?: Readonly<Record<string, unknown>>): void;
  /** Lets other plugins (P05 security counters) observe events without coupling the auth module to them. */
  subscribe(listener: SecurityEventListener): () => void;
}

/** Structured, redacted log line plus a Prometheus counter per event (P03 task 12). */
export const createSecurityEvents = (log: FastifyBaseLogger, metrics: Metrics): SecurityEvents => {
  const counter = metrics.counter('auth_events_total', 'Authentication security events', ['event']);
  let listeners: readonly SecurityEventListener[] = [];
  return {
    record: (event, fields = {}) => {
      counter.inc({ event });
      log.info({ event, ...fields }, event);
      for (const listener of listeners) listener(event, fields);
    },
    subscribe: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((existing) => existing !== listener);
      };
    },
  };
};
