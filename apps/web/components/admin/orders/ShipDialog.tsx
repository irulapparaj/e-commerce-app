'use client';

import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';

import { Dialog } from '../Dialog';
import { useToast } from '../Toast';

interface ShipDialogProps {
  readonly orderId: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

export function ShipDialog({ orderId, open, onClose, onSuccess }: ShipDialogProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  const ship = async () => {
    setBusy(true);
    try {
      await adminApi.post(`/admin/orders/${orderId}/ship`);
      notify('Order dispatched', 'success');
      onSuccess();
    } catch (error) {
      notify(isAdminApiError(error) ? error.message : 'Could not ship order', 'critical');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} titleId="ship-dialog-title" onClose={onClose} size="sm">
      <div className="admin-dialog-body">
        <h2 id="ship-dialog-title" className="admin-dialog-title">
          Ship Order
        </h2>
        <p className="admin-dialog-text">
          This will create a shipment with the courier and transition the order to{' '}
          <strong>Dispatched</strong>. The customer will be notified.
        </p>
        <div className="admin-dialog-actions">
          <button
            type="button"
            className="admin-btn"
            onClick={onClose}
            disabled={busy}
            data-autofocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={ship}
            disabled={busy}
            data-testid="ship-confirm"
          >
            {busy ? 'Shipping…' : 'Ship Now'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
