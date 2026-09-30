import { sharedPlugin } from '../lib/plugin';
import { createOrderHooks, type OrderHooks } from '../modules/orders/hooks';

export interface OrdersServices {
  readonly hooks: OrderHooks;
}

export const ordersPlugin = sharedPlugin(async (app) => {
  const hooks = createOrderHooks();
  const services: OrdersServices = { hooks };
  app.decorate('orders', services);
});
