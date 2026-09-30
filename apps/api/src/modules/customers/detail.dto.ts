import {
  asPublicValue,
  maskAddressLine,
  type Masked,
  maskEmail,
  maskName,
  maskPhone,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';

/**
 * STAFF-visible customer shapes (P08 task 3). Every personal field is typed `Masked`, so a raw
 * `phone` or `email` cannot be added without failing `tsc` (see packages/shared masking type test).
 */
export interface CustomerRow {
  readonly id: string;
  readonly maskedEmail: Masked;
  readonly maskedPhone: Masked | null;
  readonly maskedName: Masked | null;
  readonly createdAt: string;
  readonly orderCount: number;
  readonly isDisabled: boolean;
  readonly deleted: boolean;
}

export interface CustomerAddressDto {
  readonly id: string;
  readonly maskedName: Masked;
  readonly maskedLine1: Masked;
  readonly maskedLine2: Masked | null;
  readonly city: Masked;
  readonly state: Masked;
  readonly pincode: Masked;
  readonly maskedPhone: Masked;
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

/** Only ever returned by `GET …/pii` behind a reveal token (P08 task 4). */
export interface PiiDto {
  readonly email: string;
  readonly phone: string | null;
  readonly name: string | null;
  readonly addresses: readonly {
    readonly id: string;
    readonly name: string;
    readonly line1: string;
    readonly line2: string | null;
    readonly phone: string;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
  }[];
}

/** Orders in these states block erasure: the customer would lose tracking and refunds (P08 task 7). */
export const ACTIVE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'IN_TRANSIT'] as const;

export const CUSTOMER_ROW_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  createdAt: true,
  isDisabled: true,
  deletedAt: true,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

export const CUSTOMER_DETAIL_SELECT = {
  ...CUSTOMER_ROW_SELECT,
  locale: true,
  addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] },
} satisfies Prisma.UserSelect;

export type CustomerRowSource = Prisma.UserGetPayload<{ select: typeof CUSTOMER_ROW_SELECT }>;
export type CustomerDetailSource = Prisma.UserGetPayload<{ select: typeof CUSTOMER_DETAIL_SELECT }>;
export type AddressSource = CustomerDetailSource['addresses'][number];

export const toCustomerRow = (user: CustomerRowSource): CustomerRow => ({
  id: user.id,
  maskedEmail: maskEmail(user.email),
  maskedPhone: user.phone === null ? null : maskPhone(user.phone),
  maskedName: user.name === null ? null : maskName(user.name),
  createdAt: user.createdAt.toISOString(),
  orderCount: user._count.orders,
  isDisabled: user.isDisabled,
  deleted: user.deletedAt !== null,
});

export const toAddressDto = (address: AddressSource): CustomerAddressDto => ({
  id: address.id,
  maskedName: maskName(address.name),
  maskedLine1: maskAddressLine(address.line1),
  maskedLine2: address.line2 === null ? null : maskAddressLine(address.line2),
  city: asPublicValue(address.city),
  state: asPublicValue(address.state),
  pincode: asPublicValue(address.pincode),
  maskedPhone: maskPhone(address.phone),
  isDefault: address.isDefault,
});

export interface DetailExtras {
  readonly sessionCount: number;
  readonly lastSeen: Date | null;
  readonly activeOrders: number;
}

export const toCustomerDetail = (
  user: CustomerDetailSource,
  extras: DetailExtras,
): CustomerDetailDto => ({
  ...toCustomerRow(user),
  locale: user.locale,
  addresses: user.addresses.map(toAddressDto),
  sessions: { count: extras.sessionCount, lastSeen: extras.lastSeen?.toISOString() ?? null },
  orders: [],
  returnRequests: [],
  flags: { deleted: user.deletedAt !== null, activeOrders: extras.activeOrders },
});

export const toPiiDto = (user: CustomerDetailSource): PiiDto => ({
  email: user.email,
  phone: user.phone,
  name: user.name,
  addresses: user.addresses.map((address) => ({
    id: address.id,
    name: address.name,
    line1: address.line1,
    line2: address.line2,
    phone: address.phone,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  })),
});
