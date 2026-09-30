import { AppError, ok, uuidSchema } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { currentUser } from '../auth/guards';
import { verifyAndCapture } from '../payments/verify.service';
import { buildTrackingUrl } from '../shipping/tracking-url';

import { createOrder } from './create.service';
import type { OrderDetailDto, OrderSummaryDto } from './dto';
import {
  acquireIdempotencyKey,
  completeIdempotencyKey,
  failIdempotencyKey,
  hashBody,
} from './idempotency';

const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

const createOrderBody = z.strictObject({
  addressId: uuidSchema,
  shippingMethod: z.literal('standard'),
  couponCode: z.string().max(50).optional(),
  items: z
    .array(
      z.strictObject({
        variantId: uuidSchema,
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
});

const verifyPaymentBody = z.strictObject({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const orderIdParam = z.strictObject({ id: uuidSchema });

const listOrdersQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMIT_MAX).default(LIMIT_DEFAULT),
});

const toSummary = (order: {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  subtotal: number;
  shippingAmount: number;
  discountAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  total: number;
  items: readonly { quantity: number }[];
  createdAt: Date;
}): OrderSummaryDto => ({
  id: order.id,
  orderNumber: order.orderNumber,
  status: order.status,
  paymentStatus: order.paymentStatus,
  subtotalPaise: order.subtotal,
  shippingPaise: order.shippingAmount,
  discountPaise: order.discountAmount,
  tax: { cgst: order.cgstAmount, sgst: order.sgstAmount, igst: order.igstAmount },
  totalPaise: order.total,
  itemCount: order.items.reduce((acc, item) => acc + item.quantity, 0),
  createdAt: order.createdAt.toISOString(),
});

/** P12: order CRUD and payment verification, scoped to the authenticated storefront user. */
export const orderRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma, valkey, jobs, env } = app;
  const auth = guards.authenticate('storefront');

  const razorpay = app.razorpay;

  app.post(
    '/orders',
    { schema: { body: createOrderBody }, preHandler: auth },
    async (request, reply) => {
      const user = currentUser(request);
      const idempotencyKey = request.headers[IDEMPOTENCY_KEY_HEADER];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
        throw new AppError('VALIDATION', 'Idempotency-Key header is required');
      }

      const bodyHash = hashBody(request.body);
      const acquireResult = await acquireIdempotencyKey(valkey, user.id, idempotencyKey, bodyHash);
      if (!acquireResult.acquired) {
        if ('bodyMismatch' in acquireResult) {
          throw new AppError(
            'VALIDATION',
            'Idempotency-Key has already been used with a different request body',
          );
        }
        const existing = acquireResult.existing as {
          state?: string;
          status?: number;
          body?: unknown;
        } | null;
        if (existing?.state === 'DONE' && typeof existing.status === 'number') {
          return reply.code(existing.status).send(existing.body);
        }
        throw new AppError('IDEMPOTENCY_IN_PROGRESS');
      }

      try {
        const settings = await app.settings.getAll();
        const result = await createOrder(
          {
            userId: user.id,
            addressId: request.body.addressId,
            shippingMethod: request.body.shippingMethod,
            ...(request.body.couponCode !== undefined
              ? { couponCode: request.body.couponCode }
              : {}),
            items: request.body.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
            })),
          },
          {
            prisma,
            valkey,
            jobs,
            razorpay,
            shipping: app.ports.shipping,
            freeShippingThresholdPaise: settings.free_shipping_threshold,
            razorpayKeyId: env.RAZORPAY_KEY_ID,
          },
        );

        const responseBody = ok(result);
        await completeIdempotencyKey(valkey, user.id, idempotencyKey, { status: 201, body: responseBody }, bodyHash);
        return reply.code(201).send(responseBody);
      } catch (err) {
        await failIdempotencyKey(valkey, user.id, idempotencyKey);
        throw err;
      }
    },
  );

  app.post(
    '/orders/:id/verify-payment',
    { schema: { params: orderIdParam, body: verifyPaymentBody }, preHandler: auth },
    async (request) => {
      const user = currentUser(request);
      const { id: orderId } = request.params;
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = request.body;

      await verifyAndCapture(
        prisma,
        valkey,
        orderId,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user.id,
        env.RAZORPAY_KEY_SECRET,
        { razorpay, hooks: app.orders.hooks },
      );

      return ok({ verified: true });
    },
  );

  app.get(
    '/orders',
    { schema: { querystring: listOrdersQuery }, preHandler: auth },
    async (request) => {
      const user = currentUser(request);
      const { page, limit } = request.query;
      const skip = (page - 1) * limit;

      const [rows, total] = await Promise.all([
        prisma.order.findMany({
          where: { userId: user.id },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            subtotal: true,
            shippingAmount: true,
            discountAmount: true,
            cgstAmount: true,
            sgstAmount: true,
            igstAmount: true,
            total: true,
            items: { select: { quantity: true } },
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.order.count({ where: { userId: user.id } }),
      ]);

      return ok(rows.map(toSummary), { page, limit, total });
    },
  );

  app.get(
    '/orders/:id',
    { schema: { params: orderIdParam }, preHandler: auth },
    async (request) => {
      const user = currentUser(request);
      const { id: orderId } = request.params;

      const order = await prisma.order.findFirst({
        where: { id: orderId, userId: user.id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          subtotal: true,
          shippingAmount: true,
          discountAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
          total: true,
          shippingAddress: true,
          trackingNumber: true,
          courierName: true,
          items: {
            select: {
              id: true,
              variantId: true,
              productName: true,
              variantLabel: true,
              sku: true,
              unitPrice: true,
              quantity: true,
              hsnCode: true,
              gstRate: true,
            },
          },
          statusEvents: {
            select: { status: true, note: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
          createdAt: true,
        },
      });

      if (order === null) throw new AppError('NOT_FOUND');

      const address = order.shippingAddress as {
        name: string;
        phone: string;
        line1: string;
        line2?: string;
        city: string;
        state: string;
        pincode: string;
      };

      const detail: OrderDetailDto = {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotalPaise: order.subtotal,
        shippingPaise: order.shippingAmount,
        discountPaise: order.discountAmount,
        tax: { cgst: order.cgstAmount, sgst: order.sgstAmount, igst: order.igstAmount },
        totalPaise: order.total,
        itemCount: order.items.reduce((acc, item) => acc + item.quantity, 0),
        createdAt: order.createdAt.toISOString(),
        items: order.items.map((item) => ({
          id: item.id,
          variantId: item.variantId,
          name: item.productName,
          variantLabel: item.variantLabel,
          sku: item.sku,
          unitPricePaise: item.unitPrice,
          lineTotalPaise: item.unitPrice * item.quantity,
          quantity: item.quantity,
          hsnCode: item.hsnCode,
          gstRate: Number(item.gstRate),
        })),
        address,
        timeline: order.statusEvents.map((ev) => ({
          status: ev.status,
          note: ev.note,
          createdAt: ev.createdAt.toISOString(),
        })),
        tracking: {
          awb: order.trackingNumber,
          courier: order.courierName,
          url:
            order.trackingNumber && order.courierName
              ? buildTrackingUrl(order.trackingNumber, order.courierName)
              : null,
        },
        canRequestReturn: false,
      };

      return ok(detail);
    },
  );
};
