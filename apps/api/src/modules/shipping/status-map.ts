import type { OrderStatus } from '@prisma/client';

import type { ShipmentStatus } from '../../ports/shipping';

/**
 * Map Shiprocket webhook / track status strings → internal ShipmentStatus.
 * Returns null for statuses we intentionally ignore.
 */
export const mapShiprocketStatus = (raw: string): ShipmentStatus | null => {
  const normalised = raw.trim();
  switch (normalised) {
    case 'SHIPPED':
    case 'AWB Assigned':
    case 'Pickup Scheduled':
    case 'Pickup Queued':
    case 'Manifest Generated':
      return 'PICKUP_SCHEDULED';

    case 'In Transit':
    case 'Reached at Destination Hub':
    case 'In Transit - Destination':
    case 'Reached at Origin Hub':
      return 'IN_TRANSIT';

    case 'Out for Delivery':
    case 'Out For Delivery':
      return 'OUT_FOR_DELIVERY';

    case 'Delivered':
    case 'DELIVERED':
      return 'DELIVERED';

    case 'RTO Initiated':
    case 'RTO Delivered':
    case 'RTO In Transit':
    case 'Return Initiated':
      return 'RTO';

    default:
      return null;
  }
};

/**
 * Map internal ShipmentStatus → the corresponding OrderStatus for persistence.
 */
export const mapShipmentToOrderStatus = (status: ShipmentStatus): OrderStatus => {
  switch (status) {
    case 'PICKUP_SCHEDULED':
      return 'DISPATCHED';
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return 'IN_TRANSIT';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'RTO':
      return 'RETURNED';
  }
};
