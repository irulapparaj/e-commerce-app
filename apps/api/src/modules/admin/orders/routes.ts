import { ok, uuidSchema, AppError  } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { actorFromRequest, recordAudit } from '../../audit/record';
import { policyGuards } from '../policies';

import { editOrderAddress } from './address-edit.service';
import { cancelOrder } from './cancel.service';
import { getOrderDetail } from './detail.dto';
import { listOrders } from './list.query';
import { refundOrder } from './refund.service';
import { canTransition } from './transitions';

const AWB_REGEX = /^[A-Za-z0-9-]{6,40}$/;
const COURIER_MAX_LEN = 100;

const orderParams = z.strictObject({ id: uuidSchema });

const statusValues = z.enum([
  'PENDING', 'CONFIRMED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'RETURNED',
]);
const paymentStatusValues = z.enum(['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PARTIALLY_PAID']);

const listQuery = z.object({
  status: statusValues.optional(),
  paymentStatus: paymentStatusValues.optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  q: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const statusBody = z.strictObject({
  status: statusValues,
  note: z.string().min(1).max(500).optional(),
});

const shipBody = z.strictObject({
  courierPreference: z.string().max(COURIER_MAX_LEN).optional(),
});

const trackingBody = z.strictObject({
  trackingNumber: z.string().regex(AWB_REGEX, 'Invalid AWB format'),
  courierName: z.string().min(1).max(COURIER_MAX_LEN),
});

const cancelBody = z.strictObject({
  note: z.string().min(1).max(500).optional(),
});

const refundBody = z.strictObject({
  amountPaise: z.number().int().min(1),
  reason: z.string().min(10).max(500),
});

const addressBody = z.strictObject({
  name: z.string().min(1).max(200),
  phone: z.string().min(10).max(15),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
});

const notesBody = z.strictObject({
  note: z.string().min(1).max(2000),
});

export const adminOrderRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma } = app;

  const read = policyGuards(guards, 'orders.read');
  const ship = policyGuards(guards, 'orders.ship');
  const notes = policyGuards(guards, 'orders.notes');
  const statusG = policyGuards(guards, 'orders.status');
  const tracking = policyGuards(guards, 'orders.tracking');
  const cancel = policyGuards(guards, 'orders.cancel');
  const refund = policyGuards(guards, 'orders.refund');
  const addrEdit = policyGuards(guards, 'orders.address_edit');

  // GET /admin/orders — list with filters
  app.get(
    '/admin/orders',
    { schema: { querystring: listQuery }, preHandler: read },
    async (request) => {
      const result = await listOrders(prisma, app.ports.keys, request.query);
      return { success: true, data: result.data, meta: result.meta };
    },
  );

  // GET /admin/orders/:id — full detail
  app.get(
    '/admin/orders/:id',
    { schema: { params: orderParams }, preHandler: read },
    async (request) => ok(await getOrderDetail(prisma, request.params.id)),
  );

  // POST /admin/orders/:id/status — manual status transition
  app.post(
    '/admin/orders/:id/status',
    { schema: { params: orderParams, body: statusBody }, preHandler: statusG },
    async (request) => {
      const { id } = request.params;
      const { status: toStatus, note } = request.body;
      const actor = actorFromRequest(request);

      const order = await prisma.order.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (order === null) throw new AppError('NOT_FOUND', 'Order not found');

      if (!canTransition(order.status, toStatus)) {
        throw new AppError('CONFLICT', `Transition from ${order.status} to ${toStatus} is not allowed`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { status: toStatus } });
        await tx.orderStatusEvent.create({
          data: {
            orderId: id,
            status: toStatus,
            note: note ?? null,
            source: 'ADMIN',
            actorId: actor.actorId,
          },
        });
        await recordAudit(tx, {
          ...actor,
          action: 'order.status_changed',
          entityType: 'order',
          entityId: id,
          before: { status: order.status },
          after: { status: toStatus, note },
        });
      });

      return ok({ status: toStatus });
    },
  );

  // POST /admin/orders/:id/ship — ship order
  app.post(
    '/admin/orders/:id/ship',
    { schema: { params: orderParams, body: shipBody }, preHandler: ship },
    async (request) => {
      const { shipOrder } = await import('../../shipping/ship.service');
      const result = await shipOrder(
        {
          orderId: request.params.id,
          actor: actorFromRequest(request),
          ...(request.body.courierPreference !== undefined ? { courierPreference: request.body.courierPreference } : {}),
        },
        {
          prisma,
          shipping: app.ports.shipping,
          hooks: app.orders.hooks,
        },
      );
      return ok(result);
    },
  );

  // PATCH /admin/orders/:id/tracking — manual tracking correction
  app.patch(
    '/admin/orders/:id/tracking',
    { schema: { params: orderParams, body: trackingBody }, preHandler: tracking },
    async (request) => {
      const { id } = request.params;
      const { trackingNumber, courierName } = request.body;
      const actor = actorFromRequest(request);

      const order = await prisma.order.findUnique({
        where: { id },
        select: { id: true, trackingNumber: true, courierName: true },
      });
      if (order === null) throw new AppError('NOT_FOUND', 'Order not found');

      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id },
          data: { trackingNumber, courierName },
        });
        await tx.orderStatusEvent.create({
          data: {
            orderId: id,
            status: (await tx.order.findUnique({ where: { id }, select: { status: true } }))!.status,
            note: `Tracking updated: ${courierName} ${trackingNumber}`,
            source: 'ADMIN',
            actorId: actor.actorId,
          },
        });
        await recordAudit(tx, {
          ...actor,
          action: 'order.tracking_updated',
          entityType: 'order',
          entityId: id,
          before: { trackingNumber: order.trackingNumber, courierName: order.courierName },
          after: { trackingNumber, courierName },
        });
      });

      return ok({ trackingNumber, courierName });
    },
  );

  // POST /admin/orders/:id/cancel — cancel order (ADMIN + stepUp)
  app.post(
    '/admin/orders/:id/cancel',
    { schema: { params: orderParams, body: cancelBody }, preHandler: cancel },
    async (request) => {
      await cancelOrder(
        {
          orderId: request.params.id,
          ...(request.body.note !== undefined ? { note: request.body.note } : {}),
          actor: actorFromRequest(request),
        },
        {
          prisma,
          hooks: app.orders.hooks,
        },
      );
      return ok({ cancelled: true });
    },
  );

  // POST /admin/orders/:id/refund — initiate refund (ADMIN + stepUp)
  app.post(
    '/admin/orders/:id/refund',
    { schema: { params: orderParams, body: refundBody }, preHandler: refund },
    async (request, reply) => {
      const result = await refundOrder(
        {
          orderId: request.params.id,
          amountPaise: request.body.amountPaise,
          reason: request.body.reason,
          actor: actorFromRequest(request),
        },
        { prisma, razorpay: app.razorpay },
      );
      return reply.code(202).send(ok(result));
    },
  );

  // PATCH /admin/orders/:id/address — edit shipping address (ADMIN + stepUp)
  app.patch(
    '/admin/orders/:id/address',
    { schema: { params: orderParams, body: addressBody }, preHandler: addrEdit },
    async (request) => {
      await editOrderAddress(
        {
          orderId: request.params.id,
          actor: actorFromRequest(request),
          name: request.body.name,
          phone: request.body.phone,
          line1: request.body.line1,
          ...(request.body.line2 !== undefined ? { line2: request.body.line2 } : {}),
          city: request.body.city,
          state: request.body.state,
          pincode: request.body.pincode,
        },
        {
          prisma,
          shipping: app.ports.shipping,
        },
      );
      return ok({ updated: true });
    },
  );

  // POST /admin/orders/:id/notes — add internal note
  app.post(
    '/admin/orders/:id/notes',
    { schema: { params: orderParams, body: notesBody }, preHandler: notes },
    async (request) => {
      const { id } = request.params;
      const { note } = request.body;
      const actor = actorFromRequest(request);

      const order = await prisma.order.findUnique({ where: { id }, select: { id: true, notes: true } });
      if (order === null) throw new AppError('NOT_FOUND', 'Order not found');

      const updatedNotes = order.notes
        ? `${order.notes}\n\n---\n${new Date().toISOString()} (${actor.actorId ?? 'system'}): ${note}`
        : `${new Date().toISOString()} (${actor.actorId ?? 'system'}): ${note}`;

      await prisma.$transaction(async (tx) => {
        await tx.order.update({ where: { id }, data: { notes: updatedNotes } });
        await recordAudit(tx, {
          ...actor,
          action: 'order.note_added',
          entityType: 'order',
          entityId: id,
          after: { note },
        });
      });

      return ok({ notes: updatedNotes });
    },
  );
};
