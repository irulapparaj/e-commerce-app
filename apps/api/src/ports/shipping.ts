export interface ServiceabilityInput {
  readonly pincode: string;
  readonly weightGrams: number;
}

export interface Serviceability {
  readonly serviceable: boolean;
  readonly etaDays: number | null;
  readonly ratePaise: number | null;
  readonly courier: string | null;
}

export interface ShipmentAddress {
  readonly name: string;
  readonly phone: string;
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
}

export interface CreateShipmentInput {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly address: ShipmentAddress;
  readonly weightGrams: number;
  readonly amountPaise: number;
}

export interface Shipment {
  readonly shipmentId: string;
  readonly awb: string;
  readonly courier: string;
  readonly labelUrl: string | null;
}

export interface CreateReversePickupInput {
  readonly returnRequestId: string;
  readonly orderNumber: string;
  readonly address: ShipmentAddress;
  readonly weightGrams: number;
}

export interface ReversePickup {
  readonly pickupId: string;
  readonly awb: string;
  readonly courier: string;
}

export type ShipmentStatus =
  'PICKUP_SCHEDULED' | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'RTO';

export interface TrackingEvent {
  readonly status: ShipmentStatus;
  readonly at: Date;
  readonly location: string;
}

export interface Tracking {
  readonly awb: string;
  readonly status: ShipmentStatus;
  readonly events: readonly TrackingEvent[];
}

export interface ShippingPort {
  checkServiceability(input: ServiceabilityInput): Promise<Serviceability>;
  createShipment(input: CreateShipmentInput): Promise<Shipment>;
  cancelShipment(shipmentId: string): Promise<void>;
  createReversePickup(input: CreateReversePickupInput): Promise<ReversePickup>;
  track(awb: string): Promise<Tracking>;
}
