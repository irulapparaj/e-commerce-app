/**
 * Response shapes from the P08 admin API (scratchpad/admin-api-contracts-p07-p08.md, "P08").
 * Masked fields arrive already masked (`i•••@example.com`, `98•••••210`); the console never masks.
 */

export interface CustomerRow {
  readonly id: string;
  readonly maskedEmail: string;
  readonly maskedPhone: string | null;
  readonly maskedName: string | null;
  readonly createdAt: string;
  readonly orderCount: number;
  readonly isDisabled: boolean;
  readonly deleted: boolean;
}

export interface CustomerAddressDto {
  readonly id: string;
  readonly maskedName: string;
  readonly maskedLine1: string;
  readonly maskedLine2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly maskedPhone: string;
  readonly isDefault: boolean;
}

export interface CustomerDetailDto extends CustomerRow {
  readonly locale: string;
  readonly addresses: readonly CustomerAddressDto[];
  readonly sessions: { readonly count: number; readonly lastSeen: string | null };
  /** Filled by P12. */
  readonly orders: readonly never[];
  /** Filled by P22. */
  readonly returnRequests: readonly never[];
  readonly flags: { readonly deleted: boolean; readonly activeOrders: number };
}

export interface PiiAddress {
  readonly id: string;
  readonly name: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly phone: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

/** Only from `GET /admin/customers/:id/pii` behind a reveal token. */
export interface PiiDto {
  readonly email: string;
  readonly phone: string | null;
  readonly name: string | null;
  readonly addresses: readonly PiiAddress[];
}

export type SessionAudience = 'STOREFRONT' | 'ADMIN';

export interface CustomerSession {
  readonly id: string;
  readonly audience: SessionAudience;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly expiresAt: string;
}

export interface RevealResult {
  readonly revealToken: string;
  /** ISO timestamp; the TTL is server-configured (`PII_REVEAL_TTL_SECONDS`, 300 by default). */
  readonly expiresAt: string;
}

export interface EraseResult {
  readonly erasedAt: string;
  readonly retained: { readonly orders: number };
}

export interface CustomerMutation {
  readonly customer: CustomerDetailDto;
}

export const REASON_MIN = 10;
export const REASON_MAX = 500;
export const ERASE_BLOCKED_CODE = 'ERASE_BLOCKED_ACTIVE_ORDERS';
export const REVEAL_EXPIRED_CODE = 'REVEAL_EXPIRED';
export const DELETED_USER_LABEL = 'Deleted user';
