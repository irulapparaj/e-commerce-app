import { AppError } from '@pe/shared';

import type { PrismaDb } from '../../db/prisma';

export const DPDP_EXPORT_VERSION = 1;

/** Everything the platform holds about one person, in plaintext: it is their own data (P08 task 6). */
export interface UserDataExport {
  readonly version: typeof DPDP_EXPORT_VERSION;
  readonly generatedAt: string;
  readonly profile: {
    readonly id: string;
    readonly email: string;
    readonly name: string | null;
    readonly phone: string | null;
    readonly locale: string;
    readonly createdAt: string;
    readonly isDisabled: boolean;
  };
  readonly addresses: readonly {
    readonly id: string;
    readonly name: string;
    readonly phone: string;
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
    readonly state: string;
    readonly pincode: string;
    readonly isDefault: boolean;
  }[];
  readonly orders: readonly {
    readonly orderNumber: string;
    readonly createdAt: string;
    readonly status: string;
    readonly paymentStatus: string;
    readonly total: number;
    readonly shippingAddress: unknown;
    readonly items: readonly {
      readonly sku: string;
      readonly productName: string;
      readonly variantLabel: string;
      readonly quantity: number;
      readonly unitPrice: number;
    }[];
  }[];
  readonly reviews: readonly {
    readonly id: string;
    readonly productId: string;
    readonly rating: number;
    readonly title: string | null;
    readonly body: string;
    readonly status: string;
    readonly createdAt: string;
  }[];
  readonly wishlist: readonly { readonly variantId: string; readonly createdAt: string }[];
  readonly sessions: readonly {
    readonly ip: string | null;
    readonly userAgent: string | null;
    readonly createdAt: string;
    readonly lastUsedAt: string;
  }[];
  /** Consent records arrive with the newsletter/analytics work (P13/P15). */
  readonly consents: readonly never[];
}

export const exportUserData = async (
  prisma: PrismaDb,
  userId: string,
  now: () => Date = () => new Date(),
): Promise<UserDataExport> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      addresses: { orderBy: { createdAt: 'asc' } },
      orders: { orderBy: { createdAt: 'asc' }, include: { items: true } },
      reviews: { orderBy: { createdAt: 'asc' } },
      wishlistItems: { orderBy: { createdAt: 'asc' } },
      refreshTokens: { where: { revokedAt: null }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (user === null) throw new AppError('NOT_FOUND', 'Customer not found');
  return {
    version: DPDP_EXPORT_VERSION,
    generatedAt: now().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      locale: user.locale,
      createdAt: user.createdAt.toISOString(),
      isDisabled: user.isDisabled,
    },
    addresses: user.addresses.map((address) => ({
      id: address.id,
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      isDefault: address.isDefault,
    })),
    orders: user.orders.map((order) => ({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt.toISOString(),
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      shippingAddress: order.shippingAddress,
      items: order.items.map((item) => ({
        sku: item.sku,
        productName: item.productName,
        variantLabel: item.variantLabel,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    })),
    reviews: user.reviews.map((review) => ({
      id: review.id,
      productId: review.productId,
      rating: review.rating,
      title: review.title,
      body: review.body,
      status: review.status,
      createdAt: review.createdAt.toISOString(),
    })),
    wishlist: user.wishlistItems.map((item) => ({
      variantId: item.variantId,
      createdAt: item.createdAt.toISOString(),
    })),
    sessions: user.refreshTokens.map((token) => ({
      ip: token.ip,
      userAgent: token.userAgent,
      createdAt: token.createdAt.toISOString(),
      lastUsedAt: token.lastUsedAt.toISOString(),
    })),
    consents: [],
  };
};
