import { afterEach, describe, expect, it, vi } from 'vitest';

import { okEnvelope, stubFetch } from '@/test-utils/admin';

import {
  ApiCallError,
  createOrder,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  checkServiceability,
  verifyPayment,
  getOrders,
  getOrder,
} from './checkout';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ApiCallError', () => {
  it('is an error with code, status and name', () => {
    const err = new ApiCallError('INSUFFICIENT_STOCK', 409, 'Out of stock');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.status).toBe(409);
    expect(err.name).toBe('ApiCallError');
  });

  it('accepts optional details', () => {
    const err = new ApiCallError('VALIDATION', 400, 'bad', { field: 'phone' });
    expect(err.details).toEqual({ field: 'phone' });
  });
});

describe('getAddresses', () => {
  it('calls GET /account/addresses and returns data', async () => {
    const addresses = [{ id: 'a1', name: 'Home' }];
    stubFetch(() => okEnvelope(addresses));
    const result = await getAddresses();
    expect(result.data).toEqual(addresses);
  });
});

describe('createAddress', () => {
  it('calls POST /account/addresses', async () => {
    const calls = stubFetch(() => okEnvelope({ id: 'new-addr' }));
    const addr = { name: 'Work', phone: '9876543210', line1: 'Line 1', line2: null, city: 'Chennai', state: 'TN', pincode: '600001' };
    await createAddress(addr);
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toBe('/api/v1/account/addresses');
  });
});

describe('checkServiceability', () => {
  it('calls GET /shipping/serviceability with pincode param', async () => {
    const calls = stubFetch(() => okEnvelope({ serviceable: true, etaDays: 3, ratePaise: 4900, courier: 'Delhivery' }));
    const result = await checkServiceability('600001');
    expect(result.data.serviceable).toBe(true);
    expect(calls[0]?.url).toContain('600001');
  });
});

describe('verifyPayment', () => {
  it('calls POST /orders/:id/verify-payment', async () => {
    const calls = stubFetch(() => okEnvelope({ status: 'CONFIRMED' }));
    const result = await verifyPayment('order-1', {
      razorpay_order_id: 'rzp_order_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'sig',
    });
    expect(result.data.status).toBe('CONFIRMED');
    expect(calls[0]?.url).toContain('order-1');
  });
});

describe('updateAddress', () => {
  it('calls PUT /account/addresses/:id', async () => {
    const calls = stubFetch(() => okEnvelope({ id: 'a1', name: 'Updated' }));
    const addr = { name: 'Updated', phone: '9876543210', line1: 'L1', line2: null, city: 'Chennai', state: 'TN', pincode: '600001' };
    await updateAddress('a1', addr);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.url).toContain('a1');
  });
});

describe('deleteAddress', () => {
  it('calls DELETE /account/addresses/:id', async () => {
    const calls = stubFetch(() => okEnvelope(null));
    await deleteAddress('a1');
    expect(calls[0]?.method).toBe('DELETE');
  });
});

describe('setDefaultAddress', () => {
  it('calls POST /account/addresses/:id/default', async () => {
    const calls = stubFetch(() => okEnvelope({ id: 'a1', isDefault: true }));
    await setDefaultAddress('a1');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.url).toContain('default');
  });
});

describe('getOrders', () => {
  it('calls GET /orders', async () => {
    const orders = [{ id: 'o1', orderNumber: 'ORD-1' }];
    stubFetch(() => okEnvelope(orders));
    const result = await getOrders();
    expect(result.data).toEqual(orders);
  });
});

describe('getOrder', () => {
  it('calls GET /orders/:id', async () => {
    const calls = stubFetch(() => okEnvelope({ id: 'o1' }));
    await getOrder('o1');
    expect(calls[0]?.url).toContain('o1');
  });
});

describe('createOrder', () => {
  it('throws ApiCallError on API error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: { code: 'CART_EMPTY', message: 'Cart is empty' } }),
    }));
    await expect(
      createOrder(
        { addressId: 'a1', shippingMethod: 'standard', items: [{ variantId: 'v1', quantity: 1 }] },
        'key-1',
      ),
    ).rejects.toBeInstanceOf(ApiCallError);
  });

  it('returns CreateOrderResult on success', async () => {
    const mockResult = { orderId: 'o1', orderNumber: 'ORD-1', razorpayOrderId: 'rzp_1', amountPaise: 50000, keyId: 'k', summary: {} };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: mockResult }),
    }));
    const result = await createOrder(
      { addressId: 'a1', shippingMethod: 'standard', items: [{ variantId: 'v1', quantity: 1 }] },
      'key-1',
    );
    expect(result.orderId).toBe('o1');
  });
});
