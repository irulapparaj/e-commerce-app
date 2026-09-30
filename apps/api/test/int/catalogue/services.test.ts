import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { CATEGORY_TREE_CACHE_KEY } from '../../../src/modules/catalogue/tree';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory, createProduct, doc, envelope, SYSTEM } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs, revalidateTagsEnqueued } from '../../helpers/jobs';

const ACTOR = { ...SYSTEM, ip: '10.0.0.7', userAgent: 'services-test' };

describe('catalogue write services', () => {
  let testApp: TestApp;
  let categoryId: string;
  let adminId: string;

  beforeAll(async () => {
    testApp = await buildTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await resetDb();
    await resetValkey(testApp);
    await resetJobs();
    const seeded = await seedMinimal(getPrisma());
    categoryId = seeded.categoryId;
    adminId = seeded.adminId;
  });

  const audits = (action: string) =>
    getPrisma().auditLog.findMany({ where: { action }, orderBy: { createdAt: 'asc' } });

  it('creates a product inactive with a server-generated unique slug and category tax defaults, then serves it publicly once published', async () => {
    const { catalogue } = testApp.app;
    const input = {
      name: 'Rose Agarbatti',
      sku: 'ROSE-1',
      categoryId,
      description: doc('Roses'),
      specifications: {},
      howToUse: null,
      tags: ['rose'],
    };

    const first = await catalogue.products.create(input, { actor: { ...ACTOR, actorId: adminId } });
    const second = await catalogue.products.create({ ...input, sku: 'ROSE-2' }, { actor: ACTOR });
    await expect(catalogue.products.create({ ...input }, { actor: ACTOR })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      catalogue.products.setActive(first.id, true, { actor: ACTOR }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_INCOMPLETE',
      httpStatus: 422,
    });
    await catalogue.variants.create(
      first.id,
      {
        sku: 'ROSE-1-A',
        label: '50 g',
        weightGrams: 60,
        isDefault: true,
        lowStockThreshold: 5,
        price: 8000,
        compareAtPrice: 9500,
      },
      { actor: ACTOR },
    );
    await expect(
      catalogue.products.setActive(first.id, true, { actor: ACTOR }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_INCOMPLETE',
    });
    await getPrisma().productImage.create({
      data: { productId: first.id, objectKey: `products/${first.id}/x`, alt: '', sortOrder: 0 },
    });
    const published = await catalogue.products.setActive(first.id, true, { actor: ACTOR });
    const detail = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/products/${first.slug}`,
    });
    const created = await audits('product.created');

    expect(first).toMatchObject({ slug: 'rose-agarbatti', isActive: false, hsnCode: '3307' });
    expect(Number(first.gstRate)).toBe(5);
    expect(second.slug).toBe('rose-agarbatti-2');
    expect(published.isActive).toBe(true);
    expect(detail.statusCode).toBe(200);
    expect(envelope<{ priceFrom: number; compareAtFrom: number }>(detail).data).toMatchObject({
      priceFrom: 8000,
      compareAtFrom: 9500,
    });
    expect(created[0]).toMatchObject({
      actorId: adminId,
      entityType: 'product',
      entityId: first.id,
      ip: '10.0.0.7',
      userAgent: 'services-test',
    });
    expect((await audits('product.published'))[0]).toMatchObject({
      before: { isActive: false },
      after: { isActive: true },
    });
  });

  it('records variant price changes with before/after and enqueues revalidation for every write', async () => {
    const product = await createProduct(testApp, {
      name: 'Priced',
      categoryId,
      price: 5000,
      stock: 2,
    });
    const variant = product.variants[0]!;
    await resetJobs();

    const updated = await testApp.app.catalogue.variants.updatePrice(
      product.id,
      variant.id,
      { price: 6500, compareAtPrice: 7000 },
      { actor: ACTOR },
    );
    await testApp.app.catalogue.products.updateContent(
      product.id,
      { name: 'Priced Renamed' },
      { actor: ACTOR },
    );
    const priceAudit = (await audits('variant.price_updated'))[0];
    const tags = await revalidateTagsEnqueued();

    expect(updated).toMatchObject({ price: 6500, compareAtPrice: 7000 });
    expect(priceAudit?.before).toEqual({ price: 5000, compareAtPrice: null });
    expect(priceAudit?.after).toEqual({ price: 6500, compareAtPrice: 7000 });
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual(['category:agarbatti', 'home', 'product:priced', 'search']);
    expect(tags[1]).toEqual(['category:agarbatti', 'home', 'product:priced', 'search']);
    expect((await testApp.app.catalogue.products.get(product.id)).slug).toBe('priced');
  });

  it('refuses to delete products or variants with order or stock history, and deletes clean ones with their audit trail', async () => {
    const stocked = await createProduct(testApp, { name: 'Stocked', categoryId, stock: 3 });
    const clean = await createProduct(testApp, { name: 'Clean', categoryId, stock: 0 });

    await expect(
      testApp.app.catalogue.products.remove(stocked.id, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      testApp.app.catalogue.variants.remove(stocked.id, stocked.variants[0]!.id, { actor: ACTOR }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await testApp.app.catalogue.products.remove(clean.id, { actor: ACTOR });

    expect(await getPrisma().product.findUnique({ where: { id: clean.id } })).toBeNull();
    expect((await audits('product.deleted'))[0]).toMatchObject({
      entityId: clean.id,
      before: { name: 'Clean' },
    });
  });

  it('manages images: reorder must list every image once, alt updates and deletes resequence', async () => {
    const product = await createProduct(testApp, { name: 'Gallery', categoryId, stock: 1 });
    const prisma = getPrisma();
    const second = await prisma.productImage.create({
      data: {
        productId: product.id,
        objectKey: `products/${product.id}/two`,
        alt: 'two',
        sortOrder: 1,
      },
    });
    const firstId = product.images[0]!.id;
    const { images } = testApp.app.catalogue;

    await expect(images.reorder(product.id, [second.id], { actor: ACTOR })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const reordered = await images.reorder(product.id, [second.id, firstId], { actor: ACTOR });
    const withAlt = await images.updateAlt(product.id, firstId, 'Front view', { actor: ACTOR });
    await images.remove(product.id, second.id, { actor: ACTOR });
    const remaining = await prisma.productImage.findMany({ where: { productId: product.id } });

    expect(reordered.map((image) => image.id)).toEqual([second.id, firstId]);
    expect(withAlt.alt).toBe('Front view');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: firstId, sortOrder: 0 });
    expect((await audits('image.deleted'))[0]?.before).toMatchObject({ imageId: second.id });
  });

  it('category writes: nesting limits, delete guards, reorder persists sortOrder and the tree cache is invalidated', async () => {
    const { categories } = testApp.app.catalogue;
    await testApp.app.inject({ method: 'GET', url: '/api/v1/categories' });
    const parent = await createCategory(testApp, 'Lamps');
    const cacheAfterCreate = await testApp.valkey.get(CATEGORY_TREE_CACHE_KEY);
    const child = await createCategory(testApp, 'Brass Lamps', parent.id);
    await expect(createCategory(testApp, 'Too deep', child.id)).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    const childProduct = await createProduct(testApp, {
      name: 'Lamp product',
      categoryId: child.id,
      stock: 0,
    });

    await expect(categories.remove(parent.id, { actor: ACTOR })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(categories.remove(child.id, { actor: ACTOR })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await testApp.app.catalogue.products.remove(childProduct.id, { actor: ACTOR });
    const sibling = await createCategory(testApp, 'Clay Lamps', parent.id);
    const reordered = await categories.reorder([sibling.id, child.id], { actor: ACTOR });
    await expect(
      categories.reorder([sibling.id, parent.id], { actor: ACTOR }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    const renamed = await categories.update(
      child.id,
      { name: 'Bronze Lamps', parentId: parent.id, metaTitle: 'Bronze', metaDescription: null },
      { actor: ACTOR },
    );
    await categories.remove(child.id, { actor: ACTOR });
    const tree = envelope<{ slug: string; children: { slug: string }[] }[]>(
      await testApp.app.inject({ method: 'GET', url: '/api/v1/categories' }),
    ).data;

    expect(cacheAfterCreate).toBeNull();
    expect(child.slug).toBe('lamps-brass-lamps');
    expect(reordered.map((row) => [row.id, row.sortOrder])).toEqual([
      [sibling.id, 1],
      [child.id, 2],
    ]);
    expect(renamed).toMatchObject({
      name: 'Bronze Lamps',
      slug: 'lamps-brass-lamps',
      metaTitle: 'Bronze',
    });
    expect(tree.find((node) => node.slug === 'lamps')?.children.map((node) => node.slug)).toEqual([
      'lamps-clay-lamps',
    ]);
    expect((await audits('category.deleted')).length).toBe(1);
    const tags = await revalidateTagsEnqueued();
    expect(tags.some((set) => set.includes('categories') && set.includes('category:lamps'))).toBe(
      true,
    );
  });
});
