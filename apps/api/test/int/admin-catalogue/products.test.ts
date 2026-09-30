import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory, createProduct, doc } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import { resetJobs, revalidateTagsEnqueued, waitForJob } from '../../helpers/jobs';

const FIXTURES = resolve(import.meta.dirname, '../../../../../tests/fixtures/media');

interface Detail {
  readonly id: string;
  readonly slug: string;
  readonly isActive: boolean;
  readonly hsnCode: string;
  readonly gstRate: number;
  readonly variants: { id: string; price: number; label: string }[];
  readonly images: { id: string; thumbUrl: string; url: string }[];
  readonly everOrdered: boolean;
}

describe('admin catalogue routes', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;
  let categoryId: string;

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
    categoryId = (await seedMinimal(getPrisma())).categoryId;
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  it('STAFF creates a draft, edits content, cannot smuggle price/publish fields, and ADMIN publishes only when complete', async () => {
    const created = await adminInject(testApp, staff.token, 'POST', '/admin/products', {
      name: 'Staff Draft',
      sku: 'SD-1',
      categoryId,
      description: doc('hello'),
      specifications: { Size: 'M' },
      howToUse: null,
      tags: ['t'],
    });
    const product = body<Detail>(created).data;
    const content = await adminInject(
      testApp,
      staff.token,
      'PATCH',
      `/admin/products/${product.id}/content`,
      { name: 'Staff Draft 2' },
    );
    const smuggled = await adminInject(
      testApp,
      staff.token,
      'PATCH',
      `/admin/products/${product.id}/content`,
      { name: 'x', isFeatured: true },
    );
    const smuggledPrice = await adminInject(
      testApp,
      staff.token,
      'PATCH',
      `/admin/products/${product.id}/content`,
      { price: 100 },
    );
    const incomplete = await adminInject(
      testApp,
      admin.steppedToken,
      'PATCH',
      `/admin/products/${product.id}/publish`,
      { isActive: true },
    );
    const variant = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/products/${product.id}/variants`,
      {
        sku: 'SD-1-V',
        label: '10 g',
        weightGrams: 10,
        isDefault: true,
        lowStockThreshold: 2,
        price: 1500,
        compareAtPrice: null,
      },
    );
    await getPrisma().productImage.create({
      data: {
        productId: product.id,
        objectKey: `products/${product.id}/img`,
        alt: '',
        sortOrder: 0,
      },
    });
    const published = await adminInject(
      testApp,
      admin.steppedToken,
      'PATCH',
      `/admin/products/${product.id}/publish`,
      { isActive: true },
    );
    const commercial = await adminInject(
      testApp,
      admin.steppedToken,
      'PATCH',
      `/admin/products/${product.id}/commercial`,
      { hsnCode: '2914', gstRate: 18, metaTitle: 'Camphor' },
    );
    const publicDetail = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/products/${product.slug}`,
    });
    const list = await adminInject(
      testApp,
      staff.token,
      'GET',
      '/admin/products?status=active&q=staff',
    );

    expect(created.statusCode).toBe(201);
    expect(product).toMatchObject({
      isActive: false,
      hsnCode: '3307',
      gstRate: 5,
      everOrdered: false,
    });
    expect(content.statusCode).toBe(200);
    expect(smuggled.statusCode).toBe(400);
    expect(smuggledPrice.statusCode).toBe(400);
    expect(incomplete.statusCode).toBe(422);
    expect(body(incomplete).error?.code).toBe('PRODUCT_INCOMPLETE');
    expect(variant.statusCode).toBe(201);
    expect(published.statusCode).toBe(200);
    expect(body<Detail>(published).data.isActive).toBe(true);
    expect(body<Detail>(commercial).data).toMatchObject({ hsnCode: '2914', gstRate: 18 });
    expect(publicDetail.statusCode).toBe(200);
    expect(body(list).meta?.total).toBe(1);
    expect(JSON.stringify(body(list).data)).toContain('"stock"');
  });

  it('variant price and content edits are split, deletes are guarded, and every write is audited and revalidated', async () => {
    const product = await createProduct(testApp, {
      name: 'Variant host',
      categoryId,
      stock: 0,
      active: false,
    });
    const variantId = product.variants[0]!.id;
    await resetJobs();

    const priceViaContent = await adminInject(
      testApp,
      staff.token,
      'PATCH',
      `/admin/products/${product.id}/variants/${variantId}`,
      { price: 1 },
    );
    const content = await adminInject(
      testApp,
      staff.token,
      'PATCH',
      `/admin/products/${product.id}/variants/${variantId}`,
      { label: 'Renamed', lowStockThreshold: 3 },
    );
    const price = await adminInject(
      testApp,
      admin.steppedToken,
      'PATCH',
      `/admin/products/${product.id}/variants/${variantId}/price`,
      { price: 2500, compareAtPrice: 3000 },
    );
    const badCompare = await adminInject(
      testApp,
      admin.steppedToken,
      'PATCH',
      `/admin/products/${product.id}/variants/${variantId}/price`,
      { price: 2500, compareAtPrice: 2000 },
    );
    const deleted = await adminInject(
      testApp,
      admin.steppedToken,
      'DELETE',
      `/admin/products/${product.id}/variants/${variantId}`,
    );
    const gone = await adminInject(
      testApp,
      admin.steppedToken,
      'DELETE',
      `/admin/products/${product.id}`,
    );
    const actions = (await getPrisma().auditLog.findMany({ orderBy: { createdAt: 'asc' } })).map(
      (row) => row.action,
    );

    expect(priceViaContent.statusCode).toBe(400);
    expect(body<{ label: string }>(content).data.label).toBe('Renamed');
    expect(body<{ price: number; compareAtPrice: number }>(price).data).toMatchObject({
      price: 2500,
      compareAtPrice: 3000,
    });
    expect(badCompare.statusCode).toBe(400);
    expect(deleted.statusCode).toBe(200);
    expect(gone.statusCode).toBe(200);
    expect(actions).toEqual(
      expect.arrayContaining([
        'variant.updated',
        'variant.price_updated',
        'variant.deleted',
        'product.deleted',
      ]),
    );
    expect((await revalidateTagsEnqueued()).length).toBe(4);
    expect(await getPrisma().product.findUnique({ where: { id: product.id } })).toBeNull();
  });

  it('refuses the 13th image, processes a confirmed upload through the job and exposes derivatives publicly', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const { admin: workerAdmin, staff: workerStaff } = await loginAdminAndStaff(worker, {
        admin: admin.secret,
        staff: staff.secret,
      });
      const product = await createProduct(worker, {
        name: 'Gallery product',
        categoryId,
        stock: 1,
        withImage: false,
        active: false,
      });
      const prisma = getPrisma();
      await prisma.productImage.createMany({
        data: Array.from({ length: 12 }, (_, i) => ({
          productId: product.id,
          objectKey: `products/${product.id}/f${i}`,
          alt: '',
          sortOrder: i,
        })),
      });
      const full = await adminInject(
        worker,
        workerStaff.token,
        'POST',
        `/admin/products/${product.id}/images/presign`,
        { contentType: 'image/png', contentLength: 10 },
      );
      await prisma.productImage.deleteMany({ where: { productId: product.id } });
      const png = readFileSync(resolve(FIXTURES, 'sample.png'));
      const presign = body<{ url: string; key: string; headers: Record<string, string> }>(
        await adminInject(
          worker,
          workerStaff.token,
          'POST',
          `/admin/products/${product.id}/images/presign`,
          { contentType: 'image/png', contentLength: png.length },
        ),
      ).data;
      const svg = await adminInject(
        worker,
        workerStaff.token,
        'POST',
        `/admin/products/${product.id}/images/presign`,
        { contentType: 'image/svg+xml', contentLength: 10 },
      );
      const put = await fetch(presign.url, { method: 'PUT', headers: presign.headers, body: png });
      await resetJobs();
      const confirmed = await adminInject(
        worker,
        workerStaff.token,
        'POST',
        `/admin/products/${product.id}/images/confirm`,
        { key: presign.key, alt: 'Front' },
      );
      const { jobId } = body<{ jobId: string }>(confirmed).data;
      const job = await waitForJob(worker, 'media-process', jobId);
      const status = await adminInject(worker, workerStaff.token, 'GET', `/admin/jobs/${jobId}`);
      const detail = body<Detail>(
        await adminInject(worker, workerStaff.token, 'GET', `/admin/products/${product.id}`),
      ).data;
      await adminInject(
        worker,
        workerAdmin.steppedToken,
        'PATCH',
        `/admin/products/${product.id}/publish`,
        { isActive: true },
      );
      const publicDetail = await worker.app.inject({
        method: 'GET',
        url: `/api/v1/products/${product.slug}`,
      });
      const tags = await revalidateTagsEnqueued();

      expect(full.statusCode).toBe(409);
      expect(svg.statusCode).toBe(400);
      expect(put.status).toBe(200);
      expect(confirmed.statusCode).toBe(202);
      expect(job.state).toBe('completed');
      expect(body<{ state: string; error: string | null }>(status).data).toMatchObject({
        state: 'completed',
        error: null,
      });
      expect(detail.images).toHaveLength(1);
      expect(detail.images[0]?.thumbUrl).toContain('-320.webp');
      expect(publicDetail.body).toContain('-1600.avif 1600w');
      expect(tags.some((set) => set.includes(`product:${product.slug}`))).toBe(true);
    } finally {
      await worker.close();
    }
  });

  it('category routes: tree with counts, write guards for STAFF, reorder persists and delete is refused when in use', async () => {
    const parent = await createCategory(testApp, 'Lamps');
    const a = await adminInject(testApp, admin.token, 'POST', '/admin/categories', {
      name: 'Brass',
      parentId: parent.id,
      metaTitle: null,
      metaDescription: null,
    });
    const b = await adminInject(testApp, admin.token, 'POST', '/admin/categories', {
      name: 'Clay',
      parentId: parent.id,
      metaTitle: null,
      metaDescription: null,
    });
    const aId = body<{ id: string }>(a).data.id;
    const bId = body<{ id: string }>(b).data.id;
    await createProduct(testApp, { name: 'In brass', categoryId: aId, stock: 0, active: false });
    await testApp.app.inject({ method: 'GET', url: '/api/v1/categories' });

    const staffWrite = await adminInject(testApp, staff.steppedToken, 'POST', '/admin/categories', {
      name: 'Nope',
      parentId: null,
      metaTitle: null,
      metaDescription: null,
    });
    const reordered = await adminInject(
      testApp,
      admin.token,
      'PATCH',
      '/admin/categories/reorder',
      { orderedIds: [bId, aId] },
    );
    const tree = body<
      {
        id: string;
        productCount: number;
        children: { id: string; sortOrder: number; productCount: number }[];
      }[]
    >(await adminInject(testApp, staff.token, 'GET', '/admin/categories')).data;
    const inUse = await adminInject(testApp, admin.token, 'DELETE', `/admin/categories/${aId}`);
    const hasChildren = await adminInject(
      testApp,
      admin.token,
      'DELETE',
      `/admin/categories/${parent.id}`,
    );
    const removed = await adminInject(testApp, admin.token, 'DELETE', `/admin/categories/${bId}`);
    const publicTree = body<{ slug: string; children: { slug: string }[] }[]>(
      await testApp.app.inject({ method: 'GET', url: '/api/v1/categories' }),
    ).data;

    expect(a.statusCode).toBe(201);
    expect(staffWrite.statusCode).toBe(403);
    expect(reordered.statusCode).toBe(200);
    const lamps = tree.find((node) => node.id === parent.id)!;
    expect(lamps.children.map((child) => [child.id, child.sortOrder])).toEqual([
      [bId, 1],
      [aId, 2],
    ]);
    expect(lamps.children.find((child) => child.id === aId)?.productCount).toBe(1);
    expect(inUse.statusCode).toBe(409);
    expect(hasChildren.statusCode).toBe(409);
    expect(removed.statusCode).toBe(200);
    expect(
      publicTree.find((node) => node.slug === 'lamps')?.children.map((child) => child.slug),
    ).toEqual(['lamps-brass']);
  });
});
