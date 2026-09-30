export interface OrderPaidEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly razorpayPaymentId: string;
}

export type OrderPaidListener = (event: OrderPaidEvent) => Promise<void> | void;

export interface OrderCancelledEvent {
  readonly orderId: string;
  readonly userId: string;
  readonly note: string | null;
}

export type OrderCancelledListener = (event: OrderCancelledEvent) => Promise<void> | void;

export interface OrderDispatchedEvent {
  readonly orderId: string;
  readonly awb: string;
  readonly courier: string;
  readonly trackingUrl: string | null;
}

export type OrderDispatchedListener = (event: OrderDispatchedEvent) => Promise<void> | void;

export interface OrderDeliveredEvent {
  readonly orderId: string;
  readonly deliveredAt: Date;
}

export type OrderDeliveredListener = (event: OrderDeliveredEvent) => Promise<void> | void;

export interface OrderHooks {
  onOrderPaid(listener: OrderPaidListener): () => void;
  emitOrderPaid(event: OrderPaidEvent): Promise<void>;
  onOrderCancelled(listener: OrderCancelledListener): () => void;
  emitOrderCancelled(event: OrderCancelledEvent): Promise<void>;
  onOrderDispatched(listener: OrderDispatchedListener): () => void;
  emitOrderDispatched(event: OrderDispatchedEvent): Promise<void>;
  onOrderDelivered(listener: OrderDeliveredListener): () => void;
  emitOrderDelivered(event: OrderDeliveredEvent): Promise<void>;
}

export const createOrderHooks = (): OrderHooks => {
  let paidListeners: readonly OrderPaidListener[] = [];
  let cancelledListeners: readonly OrderCancelledListener[] = [];
  let dispatchedListeners: readonly OrderDispatchedListener[] = [];
  let deliveredListeners: readonly OrderDeliveredListener[] = [];

  return {
    onOrderPaid: (listener) => {
      paidListeners = [...paidListeners, listener];
      return () => {
        paidListeners = paidListeners.filter((existing) => existing !== listener);
      };
    },
    emitOrderPaid: async (event) => {
      await Promise.all(paidListeners.map(async (l) => { await l(event); }));
    },
    onOrderCancelled: (listener) => {
      cancelledListeners = [...cancelledListeners, listener];
      return () => {
        cancelledListeners = cancelledListeners.filter((existing) => existing !== listener);
      };
    },
    emitOrderCancelled: async (event) => {
      await Promise.all(cancelledListeners.map(async (l) => { await l(event); }));
    },
    onOrderDispatched: (listener) => {
      dispatchedListeners = [...dispatchedListeners, listener];
      return () => {
        dispatchedListeners = dispatchedListeners.filter((existing) => existing !== listener);
      };
    },
    emitOrderDispatched: async (event) => {
      await Promise.all(dispatchedListeners.map(async (l) => { await l(event); }));
    },
    onOrderDelivered: (listener) => {
      deliveredListeners = [...deliveredListeners, listener];
      return () => {
        deliveredListeners = deliveredListeners.filter((existing) => existing !== listener);
      };
    },
    emitOrderDelivered: async (event) => {
      await Promise.all(deliveredListeners.map(async (l) => { await l(event); }));
    },
  };
};
