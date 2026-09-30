import type {
  CustomerDetailDto,
  CustomerRow,
  CustomerSession,
  PiiDto,
} from '@/lib/admin/customer-types';

/** Shared fixtures for the P08 component tests; every personal field arrives masked. */

export const CUSTOMER_ID = '77777777-7777-4777-8777-777777777701';
export const ADDRESS_ID = '77777777-7777-4777-8777-777777777702';
export const SESSION_ID = '77777777-7777-4777-8777-777777777703';

export const customerRow: CustomerRow = {
  id: CUSTOMER_ID,
  maskedEmail: 'i•••@example.test',
  maskedPhone: '98•••••210',
  maskedName: 'I. Rajan',
  createdAt: '2026-09-01T00:00:00.000Z',
  orderCount: 2,
  isDisabled: false,
  deleted: false,
};

export const customerDetail: CustomerDetailDto = {
  ...customerRow,
  locale: 'en',
  addresses: [
    {
      id: ADDRESS_ID,
      maskedName: 'I. Rajan',
      maskedLine1: '•••• Street',
      maskedLine2: null,
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      maskedPhone: '98•••••210',
      isDefault: true,
    },
  ],
  sessions: { count: 1, lastSeen: '2026-09-26T04:00:00.000Z' },
  orders: [],
  returnRequests: [],
  flags: { deleted: false, activeOrders: 0 },
};

export const pii: PiiDto = {
  email: 'irul@example.test',
  phone: '9876543210',
  name: 'Irul Rajan',
  addresses: [
    {
      id: ADDRESS_ID,
      name: 'Irul Rajan',
      line1: '12 Temple Street',
      line2: null,
      phone: '9876543210',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
    },
  ],
};

export const customerSession: CustomerSession = {
  id: SESSION_ID,
  audience: 'STOREFRONT',
  ip: '10.0.0.9',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari',
  createdAt: '2026-09-26T03:00:00.000Z',
  lastUsedAt: '2026-09-26T04:00:00.000Z',
  expiresAt: '2026-10-26T03:00:00.000Z',
};
