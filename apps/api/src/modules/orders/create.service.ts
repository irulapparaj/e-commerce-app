import { AppError } from '@pe/shared';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';

import { nextOrderNumber } from '../../db/order-number';
import type { PrismaDb } from '../../db/prisma';
import type { JobQueue } from '../../jobs/queue';
import type { ShippingPort } from '../../ports/shipping';
import { applyMovement } from '../inventory/apply-movement';
import type { RazorpayClient } from '../payments/razorpay.client';
import { computeOrderTax } from '../tax/order-tax';
import type { OrderLineItem } from '../tax/order-tax';

import type { OrderSummaryDto } from './dto';

/** A single item in the cart checkout request — only identity and quantity come from the client. */
export interface CartItem {
  readonly variantId: string;
  readonly quantity: number;
}

/** Enriched line: OrderLineItem fields plus snapshot fields needed for the DB insert. */
interface EnrichedLine extends OrderLineItem {
  readonly variantId: string;
  readonly hsnCode: string;
}

export interface CreateOrderInput {
  readonly userId: string;
  readonly addressId: string;
  readonly shippingMethod: 'standard';
  readonly couponCode?: string;
  readonly items: readonly CartItem[];
}

export interface CreateOrderDeps {
  readonly prisma: PrismaDb;
  readonly valkey: Redis;
  readonly jobs: JobQueue;
  readonly razorpay: RazorpayClient;
  readonly shipping: ShippingPort;
  readonly freeShippingThresholdPaise: number;
  readonly razorpayKeyId: string;
}

export interface CreateOrderResult {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly razorpayOrderId: string;
  readonly amountPaise: number;
  readonly keyId: string;
  readonly summary: OrderSummaryDto;
}

const CART_KEY = (userId: string): string => `cart:${userId}`;
const _ORDER_RELEASE_DELAY = '30 minutes';

const loadAddress = async (prisma: PrismaDb, addressId: string, userId: string) => {
  const address = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, name: true, phone: true, line1: true, line2: true, city: true, state: true, pincode: true },
  });
  if (address === null) throw new AppError('NOT_FOUND', 'Address not found');
  return address;
};

const loadUser = async (prisma: PrismaDb, userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, phone: true },
  });
  if (user === null) throw new AppError('NOT_FOUND', 'User not found');
  return user;
};

const loadVariants = async (
  prisma: PrismaDb,
  items: readonly CartItem[],
) => {
  const ids = items.map((item) => item.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      price: true,
      label: true,
      sku: true,
      weightGrams: true,
      product: { select: { name: true, hsnCode: true, gstRate: true } },
    },
  });
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  return variantMap;
};

const buildEnrichedLines = (
  items: readonly CartItem[],
  variantMap: Awaited<ReturnType<typeof loadVariants>>,
): EnrichedLine[] =>
  items.map((item) => {
    const variant = variantMap.get(item.variantId);
    if (variant === undefined) throw new AppError('NOT_FOUND', `Variant ${item.variantId} not found`);
    return {
      variantId: item.variantId,
      unitPricePaise: variant.price,
      quantity: item.quantity,
      gstRatePercent: Number(variant.product.gstRate),
      hsnCode: variant.product.hsnCode,
    };
  });

const effectiveShippingPaise = (
  lines: readonly OrderLineItem[],
  shippingRatePaise: number,
  freeThresholdPaise: number,
): number => {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
  return subtotal >= freeThresholdPaise ? 0 : shippingRatePaise;
};

export const createOrder = async (
  input: CreateOrderInput,
  deps: CreateOrderDeps,
): Promise<CreateOrderResult> => {
  const { prisma, valkey, jobs, razorpay } = deps;

  if (input.items.length === 0) {
    throw new AppError('VALIDATION', 'Cart must not be empty');
  }

  // Step 1: Load address and user
  const [address, user] = await Promise.all([
    loadAddress(prisma, input.addressId, input.userId),
    loadUser(prisma, input.userId),
  ]);

  // Step 2: Load variant data for current pricing and weight
  const variantMap = await loadVariants(prisma, input.items);

  // Step 3: Check serviceability and get real shipping rate
  const totalWeightGrams = input.items.reduce((acc, item) => {
    const variant = variantMap.get(item.variantId);
    return acc + (variant?.weightGrams ?? 500) * item.quantity;
  }, 0);

  const svcResult = await deps.shipping.checkServiceability({
    pincode: address.pincode,
    weightGrams: totalWeightGrams,
  });

  if (!svcResult.serviceable) {
    throw new AppError('VALIDATION', `Delivery to pincode ${address.pincode} is not available`);
  }

  const shippingRatePaise = svcResult.ratePaise ?? 4900;

  // Step 4: Build enriched lines from current DB prices (not client-supplied prices)
  const lines = buildEnrichedLines(input.items, variantMap);
  const shippingPaise = effectiveShippingPaise(lines, shippingRatePaise, deps.freeShippingThresholdPaise);

  // Step 5: Pre-compute pricing
  const pricing = computeOrderTax(lines, shippingPaise, address.state);

  // Step 6: Create Razorpay order BEFORE DB transaction
  const rpOrder = await razorpay.createOrder(
    pricing.totalPaise,
    'INR',
    `${input.userId.slice(0, 8)}-${Date.now()}`,
    { userId: input.userId },
  );

  // Step 7: DB transaction
  const txResult = await prisma.$transaction(async (tx) => {
    // Re-compute pricing inside transaction to detect any price changes
    const freshVariants = await tx.productVariant.findMany({
      where: { id: { in: input.items.map((i) => i.variantId) } },
      select: { id: true, price: true, product: { select: { hsnCode: true, gstRate: true } } },
    });
    const freshMap = new Map(freshVariants.map((v) => [v.id, v]));

    const freshLines: EnrichedLine[] = input.items.map((item) => {
      const v = freshMap.get(item.variantId);
      if (v === undefined) throw new AppError('NOT_FOUND', `Variant ${item.variantId} not found`);
      return {
        variantId: item.variantId,
        unitPricePaise: v.price,
        quantity: item.quantity,
        gstRatePercent: Number(v.product.gstRate),
        hsnCode: v.product.hsnCode,
      };
    });

    const freshShippingPaise = effectiveShippingPaise(
      freshLines,
      shippingRatePaise,
      deps.freeShippingThresholdPaise,
    );
    const freshPricing = computeOrderTax(freshLines, freshShippingPaise, address.state);

    if (freshPricing.totalPaise !== pricing.totalPaise) {
      throw new AppError('CONFLICT', 'Prices changed since order was initiated');
    }

    const orderNumber = await nextOrderNumber(tx);

    const shippingAddressJson: Prisma.InputJsonValue = {
      name: address.name,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? null,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    };

    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        userId: input.userId,
        email: user.email,
        phone: user.phone ?? '',
        shippingAddress: shippingAddressJson,
        destinationState: address.state,
        subtotal: freshPricing.subtotalPaise,
        shippingAmount: freshPricing.shippingPaise,
        discountAmount: freshPricing.discountPaise,
        cgstAmount: freshPricing.cgstPaise,
        sgstAmount: freshPricing.sgstPaise,
        igstAmount: freshPricing.igstPaise,
        total: freshPricing.totalPaise,
        razorpayOrderId: rpOrder.id,
        couponCode: input.couponCode ?? null,
      },
      select: { id: true, orderNumber: true },
    });

    // Insert order items (snapshots)
    const itemsData = freshLines.map((line) => {
      const variant = variantMap.get(line.variantId);
      if (variant === undefined) throw new AppError('NOT_FOUND', 'Variant data missing');
      return {
        orderId: newOrder.id,
        variantId: line.variantId,
        productName: variant.product.name,
        variantLabel: variant.label,
        sku: variant.sku,
        unitPrice: line.unitPricePaise,
        quantity: line.quantity,
        hsnCode: line.hsnCode,
        gstRate: line.gstRatePercent,
      };
    });
    await tx.orderItem.createMany({ data: itemsData });

    await tx.orderStatusEvent.create({
      data: { orderId: newOrder.id, status: 'PENDING', note: null, source: 'SYSTEM' },
    });

    // Reserve stock — sorted by variantId to prevent deadlocks; any failure rolls back
    const sortedLines = [...freshLines].sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const line of sortedLines) {
      await applyMovement(
        {
          variantId: line.variantId,
          delta: -line.quantity,
          reason: 'ORDER_RESERVE',
          referenceId: newOrder.id,
        },
        tx,
      );
    }

    return { order: newOrder, freshPricing };
  });
  const { order, freshPricing: usedPricing } = txResult;

  // Step 8: Schedule release job at +30 min
  await jobs.send('order.release', { orderId: order.id }, { startAfter: '30 minutes' });

  // Step 9: Clear the cart
  try {
    await valkey.del(CART_KEY(input.userId));
  } catch {
    // Non-fatal
  }

  const summary: OrderSummaryDto = {
    id: order.id,
    orderNumber: order.orderNumber,
    status: 'PENDING',
    paymentStatus: 'PENDING',
    subtotalPaise: usedPricing.subtotalPaise,
    shippingPaise: usedPricing.shippingPaise,
    discountPaise: usedPricing.discountPaise,
    tax: {
      cgst: usedPricing.cgstPaise,
      sgst: usedPricing.sgstPaise,
      igst: usedPricing.igstPaise,
    },
    totalPaise: usedPricing.totalPaise,
    itemCount: input.items.reduce((acc, i) => acc + i.quantity, 0),
    createdAt: new Date().toISOString(),
  };

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    razorpayOrderId: rpOrder.id,
    amountPaise: usedPricing.totalPaise,
    keyId: deps.razorpayKeyId,
    summary,
  };
};
