import { createHmac } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('[test-stub] payments/test-stub.routes.ts must not be imported outside NODE_ENV=test');
}

const simulateBody = z.strictObject({
  orderId: z.uuid(),
  outcome: z.enum(['captured', 'failed']),
});

const signWebhookBody = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('hex');

export const paymentTestStubRoutes = async (instance: FastifyInstance): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('paymentTestStubRoutes must only be registered in NODE_ENV=test');
  }

  const app = instance.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/__test__/payments/simulate',
    { schema: { body: simulateBody } },
    async (request, reply) => {
      const { orderId, outcome } = request.body;

      const order = await app.prisma.order.findUnique({
        where: { id: orderId },
        select: { razorpayOrderId: true, total: true },
      });

      if (order === null) {
        return reply.code(404).send({ error: 'Order not found' });
      }

      const paymentId = `pay_test_${Date.now()}`;
      const razorpayOrderId = order.razorpayOrderId ?? `order_test_${Date.now()}`;

      const event = {
        id: `evt_test_${Date.now()}`,
        event: outcome === 'captured' ? 'payment.captured' : 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: razorpayOrderId,
              status: outcome === 'captured' ? 'captured' : 'failed',
              // The webhook handler verifies the captured amount against the order total
              amount: order.total,
            },
          },
        },
      };

      const eventBody = JSON.stringify(event);
      const signature = signWebhookBody(eventBody, app.env.RAZORPAY_WEBHOOK_SECRET);

      // POST to the webhook route in-process
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks/razorpay',
        headers: {
          'content-type': 'application/json',
          'x-razorpay-signature': signature,
        },
        payload: eventBody,
      });

      return reply.code(response.statusCode).send(JSON.parse(response.body) as unknown);
    },
  );
};
