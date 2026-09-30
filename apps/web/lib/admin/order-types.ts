/**
 * Response shapes from the P14 admin orders API.
 * Phone numbers are masked server-side (last 4 digits only: ****XXXX).
 */

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

export interface OrderRow {
  readonly id: string;
  readonly orderNumber: string;
  readonly maskedEmail: string;
  readonly maskedPhone: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly total: number;
  readonly createdAt: string;
  readonly courierName: string | null;
  readonly trackingNumber: string | null;
}

export interface OrderItemDto {
  readonly id: string;
  readonly variantId: string;
  readonly productName: string;
  readonly variantLabel: string;
  readonly sku: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly hsnCode: string;
  readonly gstRate: number;
}

export interface OrderAddressDto {
  readonly name: string;
  readonly maskedPhone: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface OrderTimelineEvent {
  readonly status: OrderStatus;
  readonly at: string;
  readonly source: 'SYSTEM' | 'ADMIN' | 'WEBHOOK';
  readonly note?: string;
}

export interface OrderDetailDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly maskedEmail: string;
  readonly maskedPhone: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly subtotal: number;
  readonly total: number;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
  readonly razorpayPaymentId: string | null;
  readonly courierName: string | null;
  readonly trackingNumber: string | null;
  readonly trackingUrl: string | null;
  readonly shiprocketOrderId: string | null;
  readonly shippingAddress: OrderAddressDto;
  readonly items: readonly OrderItemDto[];
  readonly timeline: readonly OrderTimelineEvent[];
  readonly notes: readonly { readonly at: string; readonly text: string; readonly author: string }[];
}

export interface RefundResult {
  readonly refundId: string;
  readonly status: 'INITIATED';
}

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Dispatched',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};

export const ORDER_STATUS_TONE: Readonly<Record<OrderStatus, string>> = {
  PENDING: 'admin-badge',
  CONFIRMED: 'admin-badge admin-badge-info',
  DISPATCHED: 'admin-badge admin-badge-info',
  IN_TRANSIT: 'admin-badge admin-badge-info',
  OUT_FOR_DELIVERY: 'admin-badge admin-badge-info',
  DELIVERED: 'admin-badge admin-badge-success',
  CANCELLED: 'admin-badge admin-badge-critical',
  RETURNED: 'admin-badge admin-badge-critical',
};

export const PAYMENT_STATUS_LABELS: Readonly<Record<PaymentStatus, string>> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partial Refund',
};

export const PAYMENT_STATUS_TONE: Readonly<Record<PaymentStatus, string>> = {
  PENDING: 'admin-badge',
  PAID: 'admin-badge admin-badge-success',
  FAILED: 'admin-badge admin-badge-critical',
  REFUNDED: 'admin-badge',
  PARTIALLY_REFUNDED: 'admin-badge',
};

export const REASON_MIN = 10;
export const REASON_MAX = 500;
