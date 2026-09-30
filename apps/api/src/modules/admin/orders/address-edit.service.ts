import { AppError } from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaDb, PrismaTx } from '../../../db/prisma';
import type { ShippingPort } from '../../../ports/shipping';
import type { AuditActor } from '../../audit/record';
import { recordAudit } from '../../audit/record';

export interface AddressEditInput {
  readonly orderId: string;
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly actor: AuditActor;
}

export interface AddressEditDeps {
  readonly prisma: PrismaDb;
  readonly shipping: ShippingPort;
}

type EditTx = Pick<PrismaTx, 'order' | 'orderStatusEvent' | 'auditLog'>;

/**
 * Edits the shipping address of an order before dispatch.
 *
 * Rules:
 * - Only allowed before DISPATCHED (status must be PENDING or CONFIRMED).
 * - Re-checks serviceability with the new pincode.
 * - Updates the shippingAddress JSON snapshot.
 * - Audits with before/after (phone is excluded by audit redact).
 * - Requires ADMIN + step-up (enforced by the route).
 */
export const editOrderAddress = async (
  input: AddressEditInput,
  deps: AddressEditDeps,
): Promise<void> => {
  const { prisma, shipping } = deps;

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      status: true,
      shippingAddress: true,
    },
  });

  if (order === null) throw new AppError('NOT_FOUND', 'Order not found');

  if (order.status === 'DISPATCHED' || order.status === 'IN_TRANSIT' ||
      order.status === 'DELIVERED' || order.status === 'RETURNED') {
    throw new AppError(
      'CONFLICT',
      `Address cannot be changed after dispatch; current status: ${order.status}`,
    );
  }

  // Re-check serviceability with new pincode
  const serviceability = await shipping.checkServiceability({
    pincode: input.pincode,
    weightGrams: 500, // minimum weight for serviceability check
  });

  if (!serviceability.serviceable) {
    throw new AppError(
      'CONFLICT',
      `Pincode ${input.pincode} is not serviceable`,
    );
  }

  const newAddress: Prisma.InputJsonValue = {
    name: input.name,
    phone: input.phone,
    line1: input.line1,
    line2: input.line2 ?? null,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
  };

  // Redact phone from audit (the audit record function handles this automatically
  // since 'phone' is in the AUDIT_REDACTED_KEYS list)
  const beforeRedacted = {
    city: (order.shippingAddress as Record<string, unknown>)?.city,
    state: (order.shippingAddress as Record<string, unknown>)?.state,
    pincode: (order.shippingAddress as Record<string, unknown>)?.pincode,
  };
  const afterRedacted = {
    city: input.city,
    state: input.state,
    pincode: input.pincode,
  };

  await prisma.$transaction(async (tx: EditTx) => {
    await tx.order.update({
      where: { id: input.orderId },
      data: {
        shippingAddress: newAddress,
        destinationState: input.state,
      },
    });

    await tx.orderStatusEvent.create({
      data: {
        orderId: input.orderId,
        status: order.status,
        note: `Shipping address updated to ${input.city}, ${input.state} ${input.pincode}`,
        source: 'ADMIN',
        actorId: input.actor.actorId,
      },
    });

    await recordAudit(tx, {
      ...input.actor,
      action: 'order.address_edited',
      entityType: 'order',
      entityId: input.orderId,
      before: beforeRedacted,
      after: afterRedacted,
    });
  });
};
