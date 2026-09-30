import type { Db } from '../db/prisma';
import { sharedPlugin } from '../lib/plugin';

export interface PrismaPluginOptions {
  readonly db: Db;
  /** Tests share one connection across many app instances and pass `false`. */
  readonly disconnectOnClose: boolean;
}

/** Exposes the encrypting client as `app.prisma`, registers the DB readiness check and disconnects on close. */
export const prismaPlugin = sharedPlugin<PrismaPluginOptions>(
  async (app, { db, disconnectOnClose }) => {
    app.decorate('prisma', db.prisma);
    app.decorate('prismaRaw', db.raw);
    app.readiness.add({ name: 'database', check: () => db.raw.$queryRaw`SELECT 1` });
    if (disconnectOnClose) {
      app.addHook('onClose', async () => {
        await db.raw.$disconnect();
      });
    }
  },
);
