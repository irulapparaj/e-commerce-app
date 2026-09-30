import { z } from 'zod';

import { readCsrfCookie } from '@/lib/auth/client';

import { apiClient } from './client';
import type {
  AddressCreateInput,
  AddressDto,
  CreateOrderResult,
  OrderDetailDto,
  OrderSummaryDto,
  ServiceabilityDto,
} from './types';

const createOrderResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      orderId: z.string(),
      razorpayOrderId: z.string(),
      keyId: z.string(),
      amountPaise: z.number(),
    })
    .nullish(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.unknown().optional(),
    })
    .nullish(),
});

export const getAddresses = () =>
  apiClient.get<readonly AddressDto[]>('/account/addresses');

export const createAddress = (data: AddressCreateInput) =>
  apiClient.post<AddressDto>('/account/addresses', data);

export const updateAddress = (id: string, data: AddressCreateInput) =>
  apiClient.put<AddressDto>(`/account/addresses/${id}`, data);

export const deleteAddress = (id: string) =>
  apiClient.del<void>(`/account/addresses/${id}`);

export const setDefaultAddress = (id: string) =>
  apiClient.post<AddressDto>(`/account/addresses/${id}/default`);

export const checkServiceability = (pincode: string, weightGrams = 500) =>
  apiClient.get<ServiceabilityDto>(
    `/shipping/serviceability?pincode=${encodeURIComponent(pincode)}&weightGrams=${weightGrams}`,
  );

export interface OrderItem {
  readonly variantId: string;
  readonly quantity: number;
}

export const createOrder = (
  body: { addressId: string; shippingMethod: 'standard'; couponCode?: string; items: readonly OrderItem[] },
  idempotencyKey: string,
) =>
  fetch('/api/v1/orders', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'idempotency-key': idempotencyKey,
      ...(typeof document !== 'undefined'
        ? { 'x-csrf-token': readCsrfCookie(document.cookie) ?? '' }
        : {}),
    },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const raw: unknown = await res.json();
    const parsed = createOrderResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ApiCallError('INVALID_RESPONSE', res.status, 'Unexpected API response shape');
    }
    const json = parsed.data;
    if (!json.success) {
      const details = json.error?.details;
      const fieldErrors = Array.isArray(details)
        ? (details as { path: string; message: string }[])
            .map((d) => `${d.path}: ${d.message}`)
            .join(', ')
        : undefined;
      throw new ApiCallError(
        json.error?.code ?? 'UNKNOWN',
        res.status,
        fieldErrors ?? json.error?.message ?? 'Error',
        json.error?.details,
      );
    }
    return json.data as CreateOrderResult;
  });

export const verifyPayment = (orderId: string, body: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => apiClient.post<{ status: 'CONFIRMED' }>(`/orders/${orderId}/verify-payment`, body);

export const getOrders = () =>
  apiClient.get<readonly OrderSummaryDto[]>('/orders');

export const getOrder = (id: string) =>
  apiClient.get<OrderDetailDto>(`/orders/${id}`);

export class ApiCallError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiCallError';
  }
}
