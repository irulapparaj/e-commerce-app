/** Response shapes from the P05 admin API (scratchpad/admin-api-contracts.md, "P05 — shell"). */

export type StaffRole = 'ADMIN' | 'STAFF';

export interface StaffRow {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: StaffRole;
  readonly mfaEnabled: boolean;
  readonly isDisabled: boolean;
  readonly lastLoginAt: string | null;
  readonly sessionCount: number;
  readonly createdAt: string;
}

export interface AuditActor {
  readonly id: string;
  readonly email: string;
  readonly role: string;
}

export interface AuditRow {
  readonly id: string;
  readonly actor: AuditActor | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly before: unknown;
  readonly after: unknown;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

export interface AdminSessionRow {
  readonly id: string;
  readonly user: { readonly id: string; readonly email: string; readonly role: string };
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly lastUsedAt: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type WebhookProvider = 'RAZORPAY' | 'SHIPROCKET' | 'EMAIL';

export interface SecurityOverview {
  readonly adminSessions: readonly AdminSessionRow[];
  readonly failedLogins24h: number;
  readonly mfaFailures24h: number;
  readonly webhookFailures24h: Readonly<Record<WebhookProvider, number>>;
  readonly ledgerDrift24h: number;
  readonly reconciliationMismatches: null;
}

export interface Stats {
  readonly ordersToday: number;
  readonly orders7d: number;
  readonly revenueTodayPaise: number;
  readonly revenue7dPaise: number;
  readonly productsActive: number;
  readonly lowStockCount: number;
  readonly pendingReturns: number;
  readonly customersTotal: number;
  readonly gstProfileIsPlaceholder: boolean;
}

export interface MeResponse {
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string | null;
    readonly role: string;
    readonly mfaEnabled: boolean;
    readonly locale: string;
    readonly createdAt: string;
  };
  readonly audience: string;
}

/** Audit actions written by P05 (contract doc); offered as filter suggestions, free text still allowed. */
export const AUDIT_ACTIONS = [
  'settings.updated',
  'staff.created',
  'staff.role_changed',
  'staff.mfa_reset',
  'staff.sessions_revoked',
  'security.session_revoked',
] as const;
