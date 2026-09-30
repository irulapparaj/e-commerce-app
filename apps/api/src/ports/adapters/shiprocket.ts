import { AppError } from '@pe/shared';
import type Redis from 'ioredis';

import type {
  CreateReversePickupInput,
  CreateShipmentInput,
  ReversePickup,
  Serviceability,
  ServiceabilityInput,
  Shipment,
  ShippingPort,
  Tracking,
  TrackingEvent,
} from '../shipping';

import {
  assignAwbResponseSchema,
  authResponseSchema,
  createOrderResponseSchema,
  serviceabilityResponseSchema,
  trackResponseSchema,
} from './shiprocket.types';

const TOKEN_CACHE_KEY = 'shiprocket:token';
const DEFAULT_TOKEN_TTL_SECONDS = 24 * 3600; // 24 hours
const PICKUP_POSTCODE_DEFAULT = '600001';

export interface ShiprocketConfig {
  readonly SHIPROCKET_BASE_URL: string;
  readonly SHIPROCKET_EMAIL: string | undefined;
  readonly SHIPROCKET_PASSWORD: string | undefined;
  readonly valkey: Redis;
}

const stablelMsg = (msg: string): string =>
  msg.replace(/\d{10,}/g, 'ID').replace(/token=[^&\s]*/gi, 'token=REDACTED');

const apiError = (status: number, raw: string): AppError =>
  new AppError(
    'SHIPPING_PROVIDER_ERROR',
    `Shiprocket HTTP ${status}: ${stablelMsg(raw.slice(0, 120))}`,
    { details: { raw: raw.slice(0, 500) } },
  );

/** Shiprocket API adapter (R5). All responses are Zod-parsed; token is cached in Valkey. */
export class ShiprocketAdapter implements ShippingPort {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly password: string;
  private readonly valkey: Redis;

  constructor(config: ShiprocketConfig) {
    if (!config.SHIPROCKET_EMAIL || !config.SHIPROCKET_PASSWORD) {
      throw new AppError('INTERNAL', 'Shiprocket credentials are required');
    }
    this.baseUrl = config.SHIPROCKET_BASE_URL;
    this.email = config.SHIPROCKET_EMAIL;
    this.password = config.SHIPROCKET_PASSWORD;
    this.valkey = config.valkey;
  }

  private async getToken(): Promise<string> {
    const cached = await this.valkey.get(TOKEN_CACHE_KEY);
    if (cached !== null) return cached;
    return this.refreshToken();
  }

  private async refreshToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      throw apiError(response.status, raw);
    }

    const json = await response.json().catch(() => null);
    const parsed = authResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'Shiprocket auth response malformed', {
        details: { raw: JSON.stringify(json).slice(0, 200) },
      });
    }

    const ttl = parsed.data.expires_in ?? DEFAULT_TOKEN_TTL_SECONDS;
    // Leave 5-min buffer
    const effectiveTtl = Math.max(ttl - 300, 60);
    await this.valkey.setex(TOKEN_CACHE_KEY, effectiveTtl, parsed.data.token);
    return parsed.data.token;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      // If 401, the token may be stale — clear and retry once
      if (response.status === 401) {
        await this.valkey.del(TOKEN_CACHE_KEY);
        const freshToken = await this.refreshToken();
        const retry = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${freshToken}`,
            'Content-Type': 'application/json',
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
        if (!retry.ok) {
          const raw = await retry.text().catch(() => '');
          throw apiError(retry.status, raw);
        }
        return retry.json() as Promise<T>;
      }
      const raw = await response.text().catch(() => '');
      throw apiError(response.status, raw);
    }

    return response.json() as Promise<T>;
  }

  async checkServiceability(input: ServiceabilityInput): Promise<Serviceability> {
    const body = {
      pickup_postcode: PICKUP_POSTCODE_DEFAULT,
      delivery_postcode: input.pincode,
      weight: input.weightGrams / 1000,
      cod: 0,
    };

    const raw = await this.request<unknown>('POST', '/courier/serviceability', body);
    const parsed = serviceabilityResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'Serviceability response malformed', {
        details: { raw: JSON.stringify(raw).slice(0, 200) },
      });
    }

    const companies = parsed.data.data?.available_courier_companies ?? [];
    if (companies.length === 0) {
      return { serviceable: false, etaDays: null, ratePaise: null, courier: null };
    }

    // Pick cheapest
    const cheapest = companies.reduce((a, b) => (a.rate < b.rate ? a : b));
    const etaDays = cheapest.estimated_delivery_days ?? null;
    return {
      serviceable: true,
      etaDays,
      ratePaise: Math.round(cheapest.rate * 100),
      courier: cheapest.courier_name,
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<Shipment> {
    const orderBody = {
      order_id: input.orderNumber,
      order_date: new Date().toISOString().slice(0, 10),
      pickup_location: 'Primary',
      channel_id: '',
      comment: '',
      billing_customer_name: input.address.name,
      billing_last_name: '',
      billing_address: input.address.line1,
      billing_address_2: input.address.line2 ?? '',
      billing_city: input.address.city,
      billing_pincode: input.address.pincode,
      billing_state: input.address.state,
      billing_country: 'India',
      billing_email: '',
      billing_phone: input.address.phone,
      shipping_is_billing: true,
      payment_method: 'Prepaid',
      sub_total: input.amountPaise / 100,
      length: 10,
      breadth: 10,
      height: 10,
      weight: input.weightGrams / 1000,
      order_items: [
        {
          name: `Order ${input.orderNumber}`,
          sku: input.orderNumber,
          units: 1,
          selling_price: input.amountPaise / 100,
        },
      ],
    };

    const createRaw = await this.request<unknown>('POST', '/orders/create/adhoc', orderBody);
    const createParsed = createOrderResponseSchema.safeParse(createRaw);
    if (!createParsed.success) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'Create order response malformed', {
        details: { raw: JSON.stringify(createRaw).slice(0, 200) },
      });
    }

    const shiprocketOrderId = String(createParsed.data.order_id);
    const shiprocketShipmentId = createParsed.data.shipment_id
      ? String(createParsed.data.shipment_id)
      : shiprocketOrderId;

    // Assign AWB
    const awbBody = { shipment_id: shiprocketShipmentId };
    const awbRaw = await this.request<unknown>('POST', '/courier/assign/awb', awbBody);
    const awbParsed = assignAwbResponseSchema.safeParse(awbRaw);
    if (!awbParsed.success) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'AWB assignment response malformed', {
        details: { raw: JSON.stringify(awbRaw).slice(0, 200) },
      });
    }

    // Extract AWB from nested or top-level fields
    const awb =
      awbParsed.data.response?.data?.awb_code ??
      awbParsed.data.awb_code;
    const courierName =
      awbParsed.data.response?.data?.courier_name ??
      awbParsed.data.courier_name ??
      'Shiprocket';

    if (!awb) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'No AWB returned by Shiprocket');
    }

    return {
      shipmentId: shiprocketShipmentId,
      awb,
      courier: courierName,
      labelUrl: null,
    };
  }

  async cancelShipment(shipmentId: string): Promise<void> {
    const body = { ids: [Number(shipmentId)] };
    await this.request<unknown>('POST', '/orders/cancel', body);
    // Ignore response shape — success if no HTTP error thrown
  }

  async track(awb: string): Promise<Tracking> {
    const raw = await this.request<unknown>('GET', `/courier/track/awb/${awb}`);
    const parsed = trackResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new AppError('SHIPPING_PROVIDER_ERROR', 'Track response malformed', {
        details: { raw: JSON.stringify(raw).slice(0, 200) },
      });
    }

    const trackData = parsed.data.tracking_data;
    const currentStatus =
      trackData.shipment_track?.[0]?.current_status ?? 'In Transit';

    const { mapShiprocketStatus } = await import('../../modules/shipping/status-map');
    const internalStatus = mapShiprocketStatus(currentStatus) ?? 'IN_TRANSIT';

    const events: TrackingEvent[] = (trackData.shipment_track_activities ?? []).map((a) => ({
      status: (mapShiprocketStatus(a.activity) ?? internalStatus),
      at: new Date(a.date),
      location: a.location ?? '',
    }));

    return { awb, status: internalStatus, events };
  }

  async createReversePickup(_input: CreateReversePickupInput): Promise<ReversePickup> {
    // Signature only — callers implemented in P22
    throw new AppError('INTERNAL', 'createReversePickup is not implemented until P22');
  }
}
