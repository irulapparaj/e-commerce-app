import { AppError } from '@pe/shared';
import type { OrderStatus } from '@prisma/client';

import type { PrismaDb } from '../../db/prisma';
import type { ShippingPort } from '../../ports/shipping';
import type { AuditActor } from '../audit/record';
import { recordAudit } from '../audit/record';
import type { OrderHooks } from '../orders/hooks';

import { buildTrackingUrl } from './tracking-url';

export interface ShipOrderInput {
  readonly orderId: string;
  readonly actor: AuditActor;
  readonly courierPreference?: string;
}

export interface ShipOrderDeps {
  readonly prisma: PrismaDb;
  readonly shipping: ShippingPort;
  readonly hooks: OrderHooks;
}

interface OrderForShipping {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatus;
  readonly paymentStatus: string;
  readonly shippingAddress: unknown;
  readonly total: number;
  readonly items: readonly { readonly quantity: number; readonly unitPrice: number }[];
}

const loadOrder = async (
  prisma: PrismaDb,
  orderId: string,
): Promise<OrderForShipping> => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      shippingAddress: true,
      total: true,
      items: { select: { quantity: true, unitPrice: true } },
    },
  });
  if (order === null) throw new AppError('NOT_FOUND', 'Order not found');
  return order;
};

interface AddressSnapshot {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const extractAddress = (raw: unknown): AddressSnapshot => {
  if (typeof raw !== 'object' || raw === null) return {};
  return raw;
};

/**
 * Ships a CONFIRMED + PAID order:
 * 1. Validates order state.
 * 2. Calls ShippingPort.createShipment().
 * 3. On provider error → 502, order unchanged.
 * 4. Updates order with tracking info + DISPATCHED status.
 * 5. Appends OrderStatusEvent, records audit, emits hook.
 */
export const shipOrder = async (
  input: ShipOrderInput,
  deps: ShipOrderDeps,
): Promise<{ awb: string; courier: string; trackingUrl: string | null }> => {
  const { prisma, shipping, hooks } = deps;

  const order = await loadOrder(prisma, input.orderId);

  if (order.status !== 'CONFIRMED') {
    throw new AppError('CONFLICT', `Order must be CONFIRMED to ship; current status: ${order.status}`);
  }
  if (order.paymentStatus !== 'PAID') {
    throw new AppError('CONFLICT', `Order must be PAID to ship; current payment status: ${order.paymentStatus}`);
  }

  const addr = extractAddress(order.shippingAddress);
  const totalWeight = order.items.reduce((acc, item) => acc + item.quantity * 500, 0); // 500g per item default

  let shipment: { shipmentId: string; awb: string; courier: string; labelUrl: string | null };
  try {
    shipment = await shipping.createShipment({
      orderId: input.orderId,
      orderNumber: order.orderNumber,
      address: {
        name: addr.name ?? '',
        phone: addr.phone ?? '',
        line1: addr.line1 ?? '',
        ...(addr.line2 !== undefined ? { line2: addr.line2 } : {}),
        city: addr.city ?? '',
        state: addr.state ?? '',
        pincode: addr.pincode ?? '',
      },
      weightGrams: Math.max(totalWeight, 250),
      amountPaise: order.total,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'SHIPPING_PROVIDER_ERROR') throw err;
    throw new AppError('SHIPPING_PROVIDER_ERROR', 'Shipping provider returned an unexpected error', {
      cause: err,
    });
  }

  const trackingUrl = buildTrackingUrl(shipment.awb, shipment.courier);

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: input.orderId },
      data: {
        status: 'DISPATCHED' as OrderStatus,
        trackingNumber: shipment.awb,
        courierName: shipment.courier,
        shiprocketOrderId: shipment.shipmentId,
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: input.orderId,
        status: 'DISPATCHED' as OrderStatus,
        note: `Shipped via ${shipment.courier}; AWB ${shipment.awb}`,
        source: 'ADMIN',
        actorId: input.actor.actorId,
      },
    });

    await recordAudit(tx, {
      ...input.actor,
      action: 'order.shipped',
      entityType: 'order',
      entityId: input.orderId,
      after: { awb: shipment.awb, courier: shipment.courier, trackingUrl },
    });
  });

  await hooks.emitOrderDispatched({
    orderId: input.orderId,
    awb: shipment.awb,
    courier: shipment.courier,
    trackingUrl,
  });

  return { awb: shipment.awb, courier: shipment.courier, trackingUrl };
};
