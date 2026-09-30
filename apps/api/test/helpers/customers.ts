import type { TestApp } from './app';
import { type IssuedSession, loginCustomer } from './auth';
import { getPrisma } from './db';

export interface CustomerFixture {
  readonly id: string;
  readonly email: string;
  readonly session: IssuedSession;
  readonly addressId: string;
}

export const CUSTOMER_PHONE = '9876543210';
export const CUSTOMER_LINE1 = '12 Temple Street';

/** A real customer login (session + refresh token) with a phone and one encrypted address. */
export const createCustomer = async (
  testApp: TestApp,
  email = `customer-${Date.now()}@example.test`,
  overrides: { readonly name?: string; readonly phone?: string } = {},
): Promise<CustomerFixture> => {
  const session = await loginCustomer(testApp, email);
  const prisma = getPrisma();
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name: overrides.name ?? 'Irul Rajan', phone: overrides.phone ?? CUSTOMER_PHONE },
    select: { id: true },
  });
  const address = await prisma.address.create({
    data: {
      userId: user.id,
      name: 'Irul Rajan',
      phone: overrides.phone ?? CUSTOMER_PHONE,
      line1: CUSTOMER_LINE1,
      line2: 'Near the tank',
      city: 'Chennai',
      state: 'TN',
      pincode: '600001',
      isDefault: true,
    },
    select: { id: true },
  });
  return { id: user.id, email, session, addressId: address.id };
};

export const createOrderFor = async (
  userId: string,
  variantId: string,
  status: 'PENDING' | 'CONFIRMED' | 'DELIVERED' | 'CANCELLED' = 'CONFIRMED',
) =>
  getPrisma().order.create({
    data: {
      orderNumber: `PE-2026${String(Date.now() % 100_000).padStart(5, '0')}`,
      userId,
      email: 'buyer@example.test',
      phone: CUSTOMER_PHONE,
      shippingAddress: {
        name: 'Irul Rajan',
        phone: CUSTOMER_PHONE,
        line1: CUSTOMER_LINE1,
        line2: null,
        city: 'Chennai',
        state: 'TN',
        pincode: '600001',
      },
      destinationState: 'TN',
      subtotal: 10_000,
      total: 10_500,
      cgstAmount: 250,
      sgstAmount: 250,
      status,
      paymentStatus: 'PAID',
      items: {
        create: {
          variantId,
          productName: 'Thing',
          variantLabel: 'Std',
          sku: 'THING-V1',
          unitPrice: 10_000,
          quantity: 1,
          hsnCode: '3307',
          gstRate: 5,
        },
      },
    },
  });
