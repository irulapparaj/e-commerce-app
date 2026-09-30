'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { OrderDetailDto } from '@/lib/admin/order-types';

import type { AdminRole } from '../Nav.config';
import { useToast } from '../Toast';

import { CancelDialog } from './CancelDialog';
import { NotesPanel } from './NotesPanel';
import { OrderAddress } from './OrderAddress';
import { OrderHeader } from './OrderHeader';
import { OrderItems } from './OrderItems';
import { AdminOrderTimeline } from './AdminOrderTimeline';
import { RefundDialog } from './RefundDialog';
import { ShipDialog } from './ShipDialog';

interface OrderDetailProps {
  readonly order: OrderDetailDto;
  readonly role: AdminRole;
}

const CANCEL_ELIGIBLE: ReadonlySet<string> = new Set(['PENDING', 'CONFIRMED']);
const SHIP_ELIGIBLE: ReadonlySet<string> = new Set(['CONFIRMED']);
const REFUND_ELIGIBLE: ReadonlySet<string> = new Set(['DELIVERED', 'CANCELLED', 'RETURNED']);

export function OrderDetail({ order: initial, role }: OrderDetailProps) {
  const router = useRouter();
  const { notify: _notify } = useToast();
  const [order, setOrder] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setOrder(initial);
  }
  const [shipOpen, setShipOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  const refresh = () => router.refresh();

  const canShip = SHIP_ELIGIBLE.has(order.status) && order.paymentStatus === 'PAID';
  const canCancel = CANCEL_ELIGIBLE.has(order.status);
  const canRefund = REFUND_ELIGIBLE.has(order.status) && order.razorpayPaymentId !== null;
  const isAdmin = role === 'ADMIN';

  return (
    <article aria-label={`Order ${order.orderNumber}`}>
      <OrderHeader order={order} />

      {/* Action bar */}
      <div className="admin-action-bar" role="group" aria-label="Order actions">
        {canShip && (
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={() => setShipOpen(true)}
            data-testid="ship-order-btn"
          >
            Ship Order
          </button>
        )}
        {canCancel && isAdmin && (
          <button
            type="button"
            className="admin-btn admin-btn-critical"
            onClick={() => setCancelOpen(true)}
            data-testid="cancel-order-btn"
          >
            Cancel Order
          </button>
        )}
        {canRefund && isAdmin && (
          <button
            type="button"
            className="admin-btn"
            onClick={() => setRefundOpen(true)}
            data-testid="refund-order-btn"
          >
            Initiate Refund
          </button>
        )}
      </div>

      <div className="admin-detail-grid">
        <div className="admin-detail-main">
          <OrderItems items={order.items} subtotal={order.subtotal} total={order.total} />
          <AdminOrderTimeline events={order.timeline} />
        </div>
        <div className="admin-detail-aside">
          <OrderAddress address={order.shippingAddress} />
          <NotesPanel orderId={order.id} initialNotes={order.notes} onSuccess={refresh} />
        </div>
      </div>

      <ShipDialog
        orderId={order.id}
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        onSuccess={() => {
          setShipOpen(false);
          refresh();
        }}
      />
      <CancelDialog
        orderId={order.id}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onSuccess={() => {
          setCancelOpen(false);
          refresh();
        }}
      />
      <RefundDialog
        orderId={order.id}
        maxTotal={order.total}
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        onSuccess={() => {
          setRefundOpen(false);
          refresh();
        }}
      />
    </article>
  );
}
