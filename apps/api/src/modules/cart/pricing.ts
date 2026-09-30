import type { PrismaDb } from '../../db/prisma';
import type { ImageUrlBuilder } from '../media/url';

import type { CartStorage } from './schemas';

export type CartLineFlag = 'removed' | 'unavailable' | 'reduced';

export interface CartLineDto {
  readonly variantId: string;
  readonly productSlug: string;
  readonly name: string;
  readonly variantLabel: string;
  readonly imageUrl: string | null;
  readonly unitPricePaise: number;
  readonly quantity: number;
  readonly lineTotalPaise: number;
  readonly availableQuantity: number;
  readonly flags: CartLineFlag[];
}

export interface FreeShipping {
  readonly thresholdPaise: number;
  readonly remainingPaise: number;
  readonly reached: boolean;
}

export interface CartDto {
  readonly items: CartLineDto[];
  readonly subtotalPaise: number;
  readonly itemCount: number;
  readonly freeShipping: FreeShipping;
  readonly coupon: null;
  readonly notices: CartLineFlag[];
}

const MAX_QUANTITY = 20;

const buildImageUrl = async (
  imageUrls: ImageUrlBuilder,
  objectKey: string,
  alt: string,
): Promise<string> => {
  const urls = await imageUrls.imageUrls(objectKey, alt);
  return urls.src;
};

const buildFreeShipping = (subtotal: number, thresholdPaise: number): FreeShipping => {
  if (thresholdPaise <= 0) {
    return { thresholdPaise: 0, remainingPaise: 0, reached: true };
  }
  const reached = subtotal >= thresholdPaise;
  return {
    thresholdPaise,
    remainingPaise: reached ? 0 : thresholdPaise - subtotal,
    reached,
  };
};

/** Load and price a cart from storage. Returns a typed CartDto with server-derived prices. */
export const priceCart = async (
  prisma: PrismaDb,
  imageUrls: ImageUrlBuilder,
  storage: CartStorage,
  freeShippingThresholdPaise: number,
): Promise<CartDto> => {
  const variantIds = storage.items.map((item) => item.variantId);

  if (variantIds.length === 0) {
    return {
      items: [],
      subtotalPaise: 0,
      itemCount: 0,
      freeShipping: buildFreeShipping(0, freeShippingThresholdPaise),
      coupon: null,
      notices: [],
    };
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        include: {
          images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });

  const variantMap = new Map(variants.map((v) => [v.id, v]));

  const lines: CartLineDto[] = [];
  const allFlags = new Set<CartLineFlag>();
  let subtotal = 0;
  let itemCount = 0;

  for (const stored of storage.items) {
    const variant = variantMap.get(stored.variantId);

    if (variant === undefined) {
      lines.push({
        variantId: stored.variantId,
        productSlug: '',
        name: stored.variantId,
        variantLabel: '',
        imageUrl: null,
        unitPricePaise: 0,
        quantity: 0,
        lineTotalPaise: 0,
        availableQuantity: 0,
        flags: ['removed'],
      });
      allFlags.add('removed');
      continue;
    }

    const { product } = variant;
    const firstImage = product.images[0];
    const imageUrl =
      firstImage !== undefined
        ? await buildImageUrl(imageUrls, firstImage.objectKey, firstImage.alt)
        : null;

    const flags: CartLineFlag[] = [];

    if (!product.isActive || variant.stock === 0) {
      lines.push({
        variantId: variant.id,
        productSlug: product.slug,
        name: product.name,
        variantLabel: variant.label,
        imageUrl,
        unitPricePaise: variant.price,
        quantity: 0,
        lineTotalPaise: 0,
        availableQuantity: variant.stock,
        flags: ['unavailable'],
      });
      allFlags.add('unavailable');
      continue;
    }

    let quantity = stored.quantity;

    if (quantity > variant.stock) {
      quantity = variant.stock;
      flags.push('reduced');
      allFlags.add('reduced');
    }

    quantity = Math.min(quantity, MAX_QUANTITY);
    const lineTotal = variant.price * quantity;
    subtotal += lineTotal;
    itemCount += quantity;

    lines.push({
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      variantLabel: variant.label,
      imageUrl,
      unitPricePaise: variant.price,
      quantity,
      lineTotalPaise: lineTotal,
      availableQuantity: variant.stock,
      flags,
    });
  }

  return {
    items: lines,
    subtotalPaise: subtotal,
    itemCount,
    freeShipping: buildFreeShipping(subtotal, freeShippingThresholdPaise),
    coupon: null,
    notices: Array.from(allFlags),
  };
};
