import { z } from 'zod';

import { AccountDeleted, type AccountDeletedData } from './AccountDeleted';
import { DataExportReady, type DataExportReadyData } from './DataExportReady';
import { MfaReenrol, type MfaReenrolData } from './MfaReenrol';
import { OrderCancelled, type OrderCancelledData } from './OrderCancelled';
import { OrderConfirmation, type OrderConfirmationData } from './OrderConfirmation';
import { OrderDelivered, type OrderDeliveredData } from './OrderDelivered';
import { OrderDispatched, type OrderDispatchedData } from './OrderDispatched';
import { Otp, type OtpData } from './Otp';
import { StaffInvite, type StaffInviteData } from './StaffInvite';

export type { AccountDeletedData } from './AccountDeleted';
export type { DataExportReadyData } from './DataExportReady';
export type { MfaReenrolData } from './MfaReenrol';
export type { OrderCancelledData } from './OrderCancelled';
export type {
  OrderConfirmationData,
  OrderItem,
  OrderAddress,
  OrderTotals,
} from './OrderConfirmation';
export type { OrderDeliveredData } from './OrderDelivered';
export type { OrderDispatchedData } from './OrderDispatched';
export type { OtpData } from './Otp';
export type { StaffInviteData } from './StaffInvite';

const otpSchema = z.strictObject({
  code: z.string().length(6),
  expiresMinutes: z.number().int().min(1),
});

const staffInviteSchema = z.strictObject({
  name: z.string().min(1).max(200),
  loginUrl: z.string().url(),
});

const mfaReenrolSchema = z.strictObject({
  name: z.string().min(1).max(200),
  loginUrl: z.string().url(),
});

const orderItemSchema = z.strictObject({
  name: z.string().min(1).max(500),
  quantity: z.number().int().min(1),
  unitPrice: z.string().min(1),
});

const orderAddressSchema = z.strictObject({
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().min(1).max(20),
});

const orderTotalsSchema = z.strictObject({
  subtotal: z.string().min(1),
  shipping: z.string().min(1),
  discount: z.string().min(1).optional(),
  total: z.string().min(1),
});

const orderConfirmationSchema = z.strictObject({
  orderNumber: z.string().min(1).max(50),
  items: z.array(orderItemSchema).min(1),
  totals: orderTotalsSchema,
  address: orderAddressSchema,
});

const orderCancelledSchema = z.strictObject({
  orderNumber: z.string().min(1).max(50),
  note: z.string().max(500).nullable(),
});

const orderDispatchedSchema = z.strictObject({
  orderNumber: z.string().min(1).max(50),
  trackingNumber: z.string().max(100).optional(),
  trackingUrl: z.string().url().optional(),
  carrier: z.string().max(100).optional(),
});

const orderDeliveredSchema = z.strictObject({
  orderNumber: z.string().min(1).max(50),
});

const dataExportReadySchema = z.strictObject({
  downloadUrl: z.string().url(),
  expiresMinutes: z.number().int().min(1),
});

const accountDeletedSchema = z.strictObject({
  name: z.string().min(1).max(200),
});

export interface TemplateDefinition<TData> {
  readonly component: (data: TData) => React.ReactElement;
  readonly schema: z.ZodType<TData>;
  readonly subject: (data: TData) => string;
  /** Marketing templates can be blocked by UNSUBSCRIBE suppression; transactional always send. */
  readonly marketing: boolean;
}

export const TEMPLATES = {
  otp: {
    component: (data: OtpData) => Otp(data),
    schema: otpSchema as z.ZodType<OtpData>,
    subject: () => 'Your sign-in code',
    marketing: false,
  },
  'staff-invite': {
    component: (data: StaffInviteData) => StaffInvite(data),
    schema: staffInviteSchema as z.ZodType<StaffInviteData>,
    subject: () => 'You have been invited to the admin console',
    marketing: false,
  },
  'mfa-reenrol': {
    component: (data: MfaReenrolData) => MfaReenrol(data),
    schema: mfaReenrolSchema as z.ZodType<MfaReenrolData>,
    subject: () => 'Your admin authenticator was reset',
    marketing: false,
  },
  'order-confirmation': {
    component: (data: OrderConfirmationData) => OrderConfirmation(data),
    schema: orderConfirmationSchema as z.ZodType<OrderConfirmationData>,
    subject: (data: OrderConfirmationData) => `Order ${data.orderNumber} confirmed`,
    marketing: false,
  },
  'order-cancelled': {
    component: (data: OrderCancelledData) => OrderCancelled(data),
    schema: orderCancelledSchema as z.ZodType<OrderCancelledData>,
    subject: (data: OrderCancelledData) => `Order ${data.orderNumber} cancelled`,
    marketing: false,
  },
  'order-dispatched': {
    component: (data: OrderDispatchedData) => OrderDispatched(data),
    schema: orderDispatchedSchema as z.ZodType<OrderDispatchedData>,
    subject: (data: OrderDispatchedData) => `Order ${data.orderNumber} dispatched`,
    marketing: false,
  },
  'order-delivered': {
    component: (data: OrderDeliveredData) => OrderDelivered(data),
    schema: orderDeliveredSchema as z.ZodType<OrderDeliveredData>,
    subject: (data: OrderDeliveredData) => `Order ${data.orderNumber} delivered`,
    marketing: false,
  },
  'data-export-ready': {
    component: (data: DataExportReadyData) => DataExportReady(data),
    schema: dataExportReadySchema as z.ZodType<DataExportReadyData>,
    subject: () => 'Your data export is ready',
    marketing: false,
  },
  'account-deleted': {
    component: (data: AccountDeletedData) => AccountDeleted(data),
    schema: accountDeletedSchema as z.ZodType<AccountDeletedData>,
    subject: () => 'Your account has been deleted',
    marketing: false,
  },
} as const;

export type TemplateName = keyof typeof TEMPLATES;

export type TemplateData = {
  readonly [K in TemplateName]: z.infer<(typeof TEMPLATES)[K]['schema']>;
};

/** Validate template data against its Zod schema; throws ZodError on failure. */
export const validateTemplateData = <N extends TemplateName>(
  name: N,
  data: unknown,
): TemplateData[N] => TEMPLATES[name].schema.parse(data) as TemplateData[N];
