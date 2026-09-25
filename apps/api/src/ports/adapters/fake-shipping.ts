import { randomUUID } from 'node:crypto';

import { AppError } from '@pe/shared';

import type {
  CreateReversePickupInput,
  CreateShipmentInput,
  ReversePickup,
  Serviceability,
  ServiceabilityInput,
  Shipment,
  ShipmentStatus,
  ShippingPort,
  Tracking,
} from '../shipping';

interface Lane {
  readonly etaDays: number;
  readonly ratePaise: number;
}

const LOCAL_LANE: Lane = { etaDays: 2, ratePaise: 3500 };

const LANES_BY_FIRST_DIGIT: Readonly<Record<string, Lane>> = {
  '0': { etaDays: 5, ratePaise: 6000 },
  '1': { etaDays: 5, ratePaise: 6000 },
  '2': { etaDays: 4, ratePaise: 5500 },
  '3': { etaDays: 4, ratePaise: 5500 },
  '4': { etaDays: 3, ratePaise: 4500 },
  '5': { etaDays: 3, ratePaise: 4500 },
  '7': { etaDays: 5, ratePaise: 6500 },
  '8': { etaDays: 6, ratePaise: 7000 },
  '9': { etaDays: 7, ratePaise: 7500 },
};

const COURIER = 'Delhivery';
const AWB_PREFIX = 'FAKE-';
const STATUS_TIMELINE: readonly {
  readonly afterMinutes: number;
  readonly status: ShipmentStatus;
}[] = [
  { afterMinutes: 0, status: 'PICKUP_SCHEDULED' },
  { afterMinutes: 1, status: 'IN_TRANSIT' },
  { afterMinutes: 2, status: 'OUT_FOR_DELIVERY' },
  { afterMinutes: 3, status: 'DELIVERED' },
];
const MS_PER_MINUTE = 60_000;

const NOT_SERVICEABLE: Serviceability = {
  serviceable: false,
  etaDays: null,
  ratePaise: null,
  courier: null,
};

export const laneForPincode = (pincode: string): Lane | null => {
  if (pincode.startsWith('00')) return null;
  if (pincode.startsWith('6')) return LOCAL_LANE;
  return LANES_BY_FIRST_DIGIT[pincode.charAt(0)] ?? null;
};

/** Deterministic stand-in for Shiprocket (R5). Serviceability is driven by PIN prefix; tracking by elapsed time. */
export class FakeShippingAdapter implements ShippingPort {
  private readonly createdAt = new Map<string, number>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async checkServiceability({ pincode }: ServiceabilityInput): Promise<Serviceability> {
    const lane = laneForPincode(pincode);
    if (lane === null) return NOT_SERVICEABLE;
    return {
      serviceable: true,
      etaDays: lane.etaDays,
      ratePaise: lane.ratePaise,
      courier: COURIER,
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<Shipment> {
    if (laneForPincode(input.address.pincode) === null) {
      throw new AppError('VALIDATION', `PIN ${input.address.pincode} is not serviceable`);
    }
    const awb = `${AWB_PREFIX}${randomUUID()}`;
    this.createdAt.set(awb, this.now());
    return { shipmentId: `ship_${randomUUID()}`, awb, courier: COURIER, labelUrl: null };
  }

  async createReversePickup(_input: CreateReversePickupInput): Promise<ReversePickup> {
    const awb = `${AWB_PREFIX}${randomUUID()}`;
    this.createdAt.set(awb, this.now());
    return { pickupId: `rpu_${randomUUID()}`, awb, courier: COURIER };
  }

  async track(awb: string): Promise<Tracking> {
    const start = this.createdAt.get(awb);
    if (start === undefined) throw new AppError('NOT_FOUND', `Unknown AWB ${awb}`);
    const elapsedMinutes = (this.now() - start) / MS_PER_MINUTE;
    const events = STATUS_TIMELINE.filter((step) => step.afterMinutes <= elapsedMinutes).map(
      (step) => ({
        status: step.status,
        at: new Date(start + step.afterMinutes * MS_PER_MINUTE),
        location: 'Chennai',
      }),
    );
    const latest = events.at(-1)?.status ?? 'PICKUP_SCHEDULED';
    return { awb, status: latest, events };
  }
}
