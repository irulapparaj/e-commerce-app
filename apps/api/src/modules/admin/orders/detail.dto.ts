import { AppError } from '@pe/shared';
import type { OrderStatus, PaymentStatus } from '@prisma/client';

import type { PrismaDb } from '../../../db/prisma';
import { buildTrackingUrl } from '../../shipping/tracking-url';

/** Phone masking: show last 4 digits only. */
const maskPhone = (phone: string): string => {
  if (phone.length <= 4) return '****';
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
};

export interface OrderDetailDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly total: number;
  readonly subtotal: number;
  readonly shippingAmount: number;
  readonly discountAmount: number;
  readonly tax: {
    readonly cgst: number;
    readonly sgst: number;
    readonly igst: number;
  };
  readonly tracking: {
    readonly awb: string | null;
    readonly courier: string | null;
    readonly url: string | null;
  };
  readonly address: {
    readonly name: string;
    readonly phone: string; // masked
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
  };
  readonly items: readonly {
    readonly id: string;
    readonly productName: string;
    readonly variantLabel: string;
    readonly sku: string;
    readonly unitPrice: number;
    readonly quantity: number;
    readonly hsnCode: string;
  }[];
  readonly timeline: readonly {
    readonly id: string;
    readonly status: OrderStatus;
    readonly note: string | null;
    readonly source: string;
    readonly actorId: string | null;
    readonly createdAt: string;
  }[];
  readonly notes: string | null;
  readonly customer: {
    readonly id: string;
    readonly email: string;
  };
  readonly razorpayOrderId: string | null;
  readonly razorpayPaymentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface RawAddress {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export const getOrderDetail = async (
  prisma: PrismaDb,
  orderId: string,
): Promise<OrderDetailDto> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      subtotal: true,
      shippingAmount: true,
      discountAmount: true,
      cgstAmount: true,
      sgstAmount: true,
      igstAmount: true,
      trackingNumber: true,
      courierName: true,
      shippingAddress: true,
      notes: true,
      razorpayOrderId: true,
      razorpayPaymentId: true,
      createdAt: true,
      updatedAt: true,
      items: {
        select: {
          id: true,
          productName: true,
          variantLabel: true,
          sku: true,
          unitPrice: true,
          quantity: true,
          hsnCode: true,
        },
      },
      statusEvents: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          status: true,
          note: true,
          source: true,
          actorId: true,
          createdAt: true,
        },
      },
      user: { select: { id: true, email: true } },
    },
  });

  if (order === null) throw new AppError('NOT_FOUND', 'Order not found');

  const addr = (order.shippingAddress ?? {}) as RawAddress;
  const rawPhone = addr.phone ?? '';
  const trackingUrl =
    order.trackingNumber && order.courierName
      ? buildTrackingUrl(order.trackingNumber, order.courierName)
      : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    subtotal: order.subtotal,
    shippingAmount: order.shippingAmount,
    discountAmount: order.discountAmount,
    tax: {
      cgst: order.cgstAmount,
      sgst: order.sgstAmount,
      igst: order.igstAmount,
    },
    tracking: {
      awb: order.trackingNumber,
      courier: order.courierName,
      url: trackingUrl,
    },
    address: {
      name: addr.name ?? '',
      phone: maskPhone(rawPhone), // masked in DTO; full phone only passed to ShippingPort server-side
      line1: addr.line1 ?? '',
      line2: addr.line2 ?? null,
      city: addr.city ?? '',
      state: addr.state ?? '',
      pincode: addr.pincode ?? '',
    },
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      variantLabel: item.variantLabel,
      sku: item.sku,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      hsnCode: item.hsnCode,
    })),
    timeline: order.statusEvents.map((e) => ({
      id: e.id,
      status: e.status,
      note: e.note,
      source: e.source,
      actorId: e.actorId,
      createdAt: e.createdAt.toISOString(),
    })),
    notes: order.notes,
    customer: { id: order.user.id, email: order.user.email },
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
};
