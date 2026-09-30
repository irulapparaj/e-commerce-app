import type { EnvelopeMeta } from '@pe/shared';

import type { AuditActor } from '../../src/modules/audit/record';
import type { AdminProductRow } from '../../src/modules/catalogue/service-deps';
import { applyMovement } from '../../src/modules/inventory/apply-movement';

import type { TestApp } from './app';
import { getPrisma } from './db';

export const SYSTEM: AuditActor = { actorId: null, ip: '127.0.0.1', userAgent: 'vitest' };

export const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
});

export interface ProductSpec {
  readonly name: string;
  readonly categoryId: string;
  readonly sku?: string;
  readonly price?: number;
  readonly compareAtPrice?: number | null;
  readonly stock?: number;
  readonly featured?: boolean;
  readonly active?: boolean;
  readonly withImage?: boolean;
  readonly tags?: readonly string[];
  readonly description?: object;
}

let counter = 0;

/**
 * Creates a product through the P04 services (audit + revalidation included), then adds stock via
 * the ledger and an image row directly (the media job is exercised by its own suite).
 */
export const createProduct = async (
  testApp: TestApp,
  spec: ProductSpec,
  actor: AuditActor = SYSTEM,
): Promise<AdminProductRow> => {
  counter += 1;
  const { catalogue } = testApp.app;
  const prisma = getPrisma();
  const created = await catalogue.products.create(
    {
      name: spec.name,
      sku: spec.sku ?? `T-${Date.now().toString(36)}-${counter}`,
      categoryId: spec.categoryId,
      description: (spec.description ?? doc(`${spec.name} description`)) as never,
      specifications: { Quantity: '1 unit' },
      howToUse: null,
      tags: [...(spec.tags ?? [])],
    },
    { actor },
  );
  const variant = await catalogue.variants.create(
    created.id,
    {
      sku: `${created.sku}-V1`,
      label: 'Standard',
      weightGrams: 100,
      isDefault: true,
      lowStockThreshold: 5,
      price: spec.price ?? 10_000,
      compareAtPrice: spec.compareAtPrice ?? null,
    },
    { actor },
  );
  if ((spec.stock ?? 0) > 0) {
    await prisma.$transaction((tx) =>
      applyMovement(
        { variantId: variant.id, delta: spec.stock ?? 0, reason: 'IMPORT', note: 'test' },
        tx,
      ),
    );
  }
  if (spec.withImage !== false) {
    await prisma.productImage.create({
      data: {
        productId: created.id,
        objectKey: `products/${created.id}/img-${counter}`,
        alt: `${spec.name} image`,
        sortOrder: 0,
      },
    });
  }
  if (spec.featured === true) await catalogue.products.setFeatured(created.id, true, { actor });
  if (spec.active !== false) await catalogue.products.setActive(created.id, true, { actor });
  return catalogue.products.get(created.id);
};

export const createCategory = async (
  testApp: TestApp,
  name: string,
  parentId: string | null = null,
) =>
  testApp.app.catalogue.categories.create(
    { name, parentId, metaTitle: null, metaDescription: null },
    { actor: SYSTEM },
  );

interface ParsedEnvelope<T> {
  data: T;
  meta?: EnvelopeMeta;
  error: { code: string } | null;
}

export const envelope = <T>(res: { body: string }): ParsedEnvelope<T> =>
  JSON.parse(res.body) as ParsedEnvelope<T>;
