import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  brand,
  DEFAULT_HSN_BY_CATEGORY,
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  PICKUP_LOCATION_DEFAULT,
  RETURN_WINDOW_DAYS_DEFAULT,
} from '@pe/shared';

import type { PrismaDb } from '../src/db/prisma';
import { applyMovement } from '../src/modules/inventory/apply-movement';

import {
  type CategorySeed,
  categoriesSeedSchema,
  type ProductSeed,
  productsSeedSchema,
} from './seed-schema';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'seed-data');
export const ADMIN_EMAIL = 'admin@example.test';

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(resolve(DATA_DIR, file), 'utf8')) as unknown;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => m.slice(1, -1))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const descriptionDoc = (name: string) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: `${name} from ${brand.name}, made for everyday puja.` }],
    },
  ],
});

export const SITE_SETTING_DEFAULTS: Readonly<Record<string, unknown>> = {
  announcement_bar: { enabled: true, text: 'Free shipping on orders above ₹599' },
  free_shipping_threshold: FREE_SHIPPING_THRESHOLD_DEFAULT,
  brand: {
    name: brand.name,
    tagline: brand.tagline,
    logoKey: null,
    faviconKey: null,
    placeholder: true,
  },
  gst_profile: {
    gstin: '33AAAAA0000A1Z5',
    legalName: `${brand.name} (placeholder)`,
    stateCode: '33',
    placeholder: true,
  },
  pickup_location: {
    name: `${brand.name} Warehouse`,
    line1: 'Placeholder address',
    ...PICKUP_LOCATION_DEFAULT,
  },
  return_window_days: RETURN_WINDOW_DAYS_DEFAULT,
  promo_popup: { enabled: false },
};

const upsertCategoryTree = async (
  db: PrismaDb,
  seeds: readonly CategorySeed[],
): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();
  for (const seed of seeds) {
    const parent = await db.category.upsert({
      where: { slug: seed.slug },
      create: { slug: seed.slug, name: seed.name, sortOrder: seed.sortOrder },
      update: { name: seed.name, sortOrder: seed.sortOrder },
      select: { id: true },
    });
    ids.set(seed.slug, parent.id);
    for (const [index, childName] of seed.children.entries()) {
      const slug = `${seed.slug}-${slugify(childName)}`;
      const child = await db.category.upsert({
        where: { slug },
        create: { slug, name: childName, parentId: parent.id, sortOrder: index + 1 },
        update: { name: childName, parentId: parent.id, sortOrder: index + 1 },
        select: { id: true },
      });
      ids.set(`${seed.slug}/${slugify(childName)}`, child.id);
    }
  }
  return ids;
};

const upsertVariant = async (
  db: PrismaDb,
  productId: string,
  variant: ProductSeed['variants'][number],
): Promise<void> => {
  const existing = await db.productVariant.findUnique({
    where: { sku: variant.sku },
    select: { id: true },
  });
  const data = {
    label: variant.label,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? null,
    weightGrams: variant.weightGrams,
    isDefault: variant.isDefault,
  };
  if (existing !== null) {
    await db.productVariant.update({ where: { id: existing.id }, data });
    return;
  }
  await db.$transaction(async (tx) => {
    const created = await tx.productVariant.create({
      data: { ...data, productId, sku: variant.sku, stock: 0 },
      select: { id: true },
    });
    if (variant.stock > 0) {
      await applyMovement(
        { variantId: created.id, delta: variant.stock, reason: 'IMPORT', note: 'seed' },
        tx,
      );
    }
  });
};

const upsertProduct = async (
  db: PrismaDb,
  seed: ProductSeed,
  categoryIds: ReadonlyMap<string, string>,
): Promise<void> => {
  const categoryId = categoryIds.get(seed.category);
  if (categoryId === undefined)
    throw new Error(`Unknown category ${seed.category} for ${seed.sku}`);
  const topLevel = seed.category.split('/')[0] ?? '';
  const defaults = DEFAULT_HSN_BY_CATEGORY[topLevel];
  if (defaults === undefined) throw new Error(`No HSN default for ${topLevel}`);
  const slug = slugify(seed.name);
  const data = {
    name: seed.name,
    slug,
    categoryId,
    hsnCode: seed.hsnCode ?? defaults.hsnCode,
    gstRate: seed.gstRate ?? defaults.gstRate,
    tags: seed.tags,
    isFeatured: seed.isFeatured,
    isActive: true,
    description: descriptionDoc(seed.name),
    specifications: seed.specifications,
  };
  const product = await db.product.upsert({
    where: { sku: seed.sku },
    create: { ...data, sku: seed.sku },
    update: data,
    select: { id: true },
  });
  for (const variant of seed.variants) await upsertVariant(db, product.id, variant);
  const imageKey = `products/${slug}/1.webp`;
  const image = await db.productImage.findFirst({
    where: { productId: product.id, objectKey: imageKey },
    select: { id: true },
  });
  if (image === null)
    await db.productImage.create({
      data: { productId: product.id, objectKey: imageKey, alt: seed.name, sortOrder: 0 },
    });
};

export const seedAdmin = (db: PrismaDb) =>
  db.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: { email: ADMIN_EMAIL, name: 'Store Admin', role: 'ADMIN', mfaEnabled: false },
    update: { role: 'ADMIN' },
    select: { id: true },
  });

export const seedSettings = async (db: PrismaDb): Promise<void> => {
  for (const [key, value] of Object.entries(SITE_SETTING_DEFAULTS)) {
    await db.siteSetting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: {},
    });
  }
};

/** Idempotent: upserts by slug/sku/email/key so repeated runs leave identical counts. */
export const runSeed = async (db: PrismaDb): Promise<{ categories: number; products: number }> => {
  const categories = categoriesSeedSchema.parse(readJson('categories.json'));
  const products = productsSeedSchema.parse(readJson('products.json'));
  const categoryIds = await upsertCategoryTree(db, categories);
  for (const product of products) await upsertProduct(db, product, categoryIds);
  await seedAdmin(db);
  await seedSettings(db);
  return { categories: categoryIds.size, products: products.length };
};

/** One category, two products (with variants and stock), one admin — the integration-test baseline. */
export const seedMinimal = async (
  db: PrismaDb,
): Promise<{ adminId: string; categoryId: string; variantIds: readonly string[] }> => {
  const categories = categoriesSeedSchema.parse(readJson('categories.json')).slice(0, 1);
  const products = productsSeedSchema.parse(readJson('products.json')).slice(0, 2);
  const categoryIds = await upsertCategoryTree(db, categories);
  for (const product of products) await upsertProduct(db, product, categoryIds);
  const admin = await seedAdmin(db);
  await seedSettings(db);
  const variants = await db.productVariant.findMany({
    orderBy: { sku: 'asc' },
    select: { id: true },
  });
  return {
    adminId: admin.id,
    categoryId: categoryIds.get('agarbatti') ?? '',
    variantIds: variants.map((v) => v.id),
  };
};
