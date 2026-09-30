import type { TemplateData, TemplateName } from '../templates';

export const FIXTURES: { readonly [K in TemplateName]: TemplateData[K] } = {
  otp: {
    code: '123456',
    expiresMinutes: 10,
  },
  'staff-invite': {
    name: 'Priya Sharma',
    loginUrl: 'https://example.com/admin/login',
  },
  'mfa-reenrol': {
    name: 'Priya Sharma',
    loginUrl: 'https://example.com/admin/login',
  },
  'order-confirmation': {
    orderNumber: 'PE-2024-001234',
    items: [
      { name: 'Puja Thali Set', quantity: 2, unitPrice: '₹599' },
      { name: 'Agarbatti — Sandalwood (Pack of 6)', quantity: 1, unitPrice: '₹120' },
    ],
    totals: {
      subtotal: '₹1,318',
      shipping: '₹49',
      discount: '₹100',
      total: '₹1,267',
    },
    address: {
      line1: '42, MG Road',
      line2: 'Apartment 3B',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
    },
  },
  'order-cancelled': {
    orderNumber: 'PE-2024-001234',
    note: 'Item out of stock.',
  },
  'order-dispatched': {
    orderNumber: 'PE-2024-001234',
    trackingNumber: 'SR1234567890',
    trackingUrl: 'https://shiprocket.co/tracking/SR1234567890',
    carrier: 'Shiprocket',
  },
  'order-delivered': {
    orderNumber: 'PE-2024-001234',
  },
  'data-export-ready': {
    downloadUrl: 'https://example.com/exports/dpdp/user-export.json?token=xyz',
    expiresMinutes: 15,
  },
  'account-deleted': {
    name: 'Priya Sharma',
  },
};
