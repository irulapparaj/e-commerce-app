import { AppError, ok } from '@pe/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { currentUser } from '../auth/guards';

import { addressCreateSchema, addressIdParam } from './schemas';

const MAX_ADDRESSES = 10;

const ADDRESS_SELECT = {
  id: true,
  name: true,
  phone: true,
  line1: true,
  line2: true,
  city: true,
  state: true,
  pincode: true,
  isDefault: true,
  createdAt: true,
} as const;

/** P12: address book endpoints scoped to the authenticated storefront user. */
export const addressRoutes = async (instance: FastifyInstance): Promise<void> => {
  const app = instance.withTypeProvider<ZodTypeProvider>();
  const { guards, prisma } = app;
  const auth = guards.authenticate('storefront');

  app.get('/account/addresses', { preHandler: auth }, async (request) => {
    const { id: userId } = currentUser(request);
    const rows = await prisma.address.findMany({
      where: { userId },
      select: ADDRESS_SELECT,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return ok(
      rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  });

  app.post(
    '/account/addresses',
    { schema: { body: addressCreateSchema }, preHandler: auth },
    async (request, reply) => {
      const { id: userId } = currentUser(request);
      const count = await prisma.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new AppError('CONFLICT', `Maximum ${MAX_ADDRESSES} addresses allowed`);
      }

      const isDefault = count === 0;
      const address = await prisma.address.create({
        data: { ...request.body, userId, isDefault },
        select: ADDRESS_SELECT,
      });
      return reply.code(201).send(ok({ ...address, createdAt: address.createdAt.toISOString() }));
    },
  );

  app.put(
    '/account/addresses/:addressId',
    { schema: { params: addressIdParam, body: addressCreateSchema }, preHandler: auth },
    async (request) => {
      const { id: userId } = currentUser(request);
      const { addressId } = request.params;

      const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
      if (existing === null) throw new AppError('NOT_FOUND');

      const updated = await prisma.address.update({
        where: { id: addressId },
        data: request.body,
        select: ADDRESS_SELECT,
      });
      return ok({ ...updated, createdAt: updated.createdAt.toISOString() });
    },
  );

  app.delete(
    '/account/addresses/:addressId',
    { schema: { params: addressIdParam }, preHandler: auth },
    async (request, reply) => {
      const { id: userId } = currentUser(request);
      const { addressId } = request.params;

      const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
      if (existing === null) throw new AppError('NOT_FOUND');

      await prisma.$transaction(async (tx) => {
        await tx.address.delete({ where: { id: addressId } });
        if (existing.isDefault) {
          const next = await tx.address.findFirst({
            where: { userId, id: { not: addressId } },
            orderBy: { createdAt: 'asc' },
          });
          if (next !== null) {
            await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
          }
        }
      });

      return reply.code(204).send();
    },
  );

  app.post(
    '/account/addresses/:addressId/default',
    { schema: { params: addressIdParam }, preHandler: auth },
    async (request) => {
      const { id: userId } = currentUser(request);
      const { addressId } = request.params;

      const existing = await prisma.address.findFirst({ where: { id: addressId, userId } });
      if (existing === null) throw new AppError('NOT_FOUND');

      await prisma.$transaction(async (tx) => {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
        await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
      });

      return ok({ id: addressId });
    },
  );
};
