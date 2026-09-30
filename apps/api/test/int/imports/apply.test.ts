import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adminInject, type AdminSession, body, loginAdminAndStaff } from '../../helpers/admin';
import { buildTestApp, type TestApp } from '../../helpers/app';
import { resetValkey } from '../../helpers/auth';
import { createCategory } from '../../helpers/catalogue';
import { getPrisma, resetDb, seedMinimal } from '../../helpers/db';
import {
  applyNow,
  getImport,
  importFixture,
  IMPORTS_BUCKET,
  uploadImport,
  validateNow,
} from '../../helpers/imports';
import { listQueuedJobs, resetJobs, revalidateTagsEnqueued, waitForJob } from '../../helpers/jobs';

const withLine = (csv: Buffer, replace: (line: string) => string): Buffer =>
  Buffer.from(csv.toString('utf8').split('\n').map(replace).join('\n'), 'utf8');

describe('import apply', () => {
  let testApp: TestApp;
  let admin: AdminSession;
  let staff: AdminSession;

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
    await seedMinimal(getPrisma());
    ({ admin, staff } = await loginAdminAndStaff(testApp));
    await resetJobs();
  });

  const uploadAndValidate = async (bytes: Buffer) => {
    const { job } = await uploadImport(testApp, admin, bytes);
    const result = await validateNow(testApp, job.id);
    expect(result.status).toBe('VALIDATED');
    await resetJobs();
    return job.id;
  };

  it('creates products, variants and IMPORT ledger rows in one transaction with one audit row', async () => {
    const jobId = await uploadAndValidate(importFixture('valid.csv'));

    const result = await applyNow(testApp, jobId, admin);
    const prisma = getPrisma();
    const products = await prisma.product.findMany({
      where: { sku: { startsWith: 'IMP-' } },
      orderBy: { sku: 'asc' },
      include: { variants: { orderBy: { sku: 'asc' } }, category: true },
    });
    const movements = await prisma.stockMovement.findMany({ where: { referenceId: jobId } });
    const audits = await prisma.auditLog.findMany({ where: { action: 'import.applied' } });
    const dto = await getImport(testApp, staff, jobId);
    const publicDetail = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/products/${products[0]!.slug}`,
    });

    expect(result).toEqual({
      jobId,
      creates: 3,
      updates: 0,
      variantsCreated: 5,
      variantsUpdated: 0,
      movements: 4,
      activationDeferred: 2,
    });
    expect(products.map((product) => product.sku)).toEqual([
      'IMP-AG-001',
      'IMP-CM-002',
      'IMP-DH-003',
    ]);
    expect(products[0]).toMatchObject({
      name: 'Import Sandalwood Agarbatti',
      slug: 'import-sandalwood-agarbatti',
      hsnCode: '3307',
      isActive: false, // H-23: activation gated on ≥1 image; deferred since no images in import
      isFeatured: true,
      tags: ['sandalwood', 'daily'],
      specifications: { Quantity: '20 sticks', 'Burn time': '45 min' },
      metaTitle: 'Sandalwood Agarbatti',
    });
    expect(
      products[0]?.variants.map((variant) => [
        variant.sku,
        variant.price,
        variant.stock,
        variant.isDefault,
      ]),
    ).toEqual([
      ['IMP-AG-001-20', 8050, 120, true],
      ['IMP-AG-001-50', 18000, 60, false],
    ]);
    expect(products[1]?.variants.map((variant) => variant.stock)).toEqual([0, 200]);
    expect(products[2]?.description).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '=HYPERLINK("http://evil.example")' }],
        },
      ],
    });
    expect(movements).toHaveLength(4);
    expect(movements.every((row) => row.reason === 'IMPORT' && row.actorId === admin.userId)).toBe(
      true,
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toMatchObject({ creates: 3, movements: 4, totalRows: 5 });
    expect(dto).toMatchObject({ status: 'APPLIED', error: null });
    expect(dto.appliedAt).not.toBeNull();
    // Product activation is deferred (no images yet), so the public endpoint returns 404
    expect(publicDetail.statusCode).toBe(404);
    const tags = await revalidateTagsEnqueued();
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual(
      expect.arrayContaining([
        'home',
        'search',
        'category:agarbatti',
        'product:import-sandalwood-agarbatti',
      ]),
    );
  });

  it('re-applying the same sheet only updates and writes no stock movements', async () => {
    const first = await uploadAndValidate(importFixture('valid.csv'));
    await applyNow(testApp, first, admin);
    const second = await uploadAndValidate(importFixture('valid.csv'));
    const before = await getImport(testApp, admin, second);

    const result = await applyNow(testApp, second, admin);
    const movements = await getPrisma().stockMovement.count({ where: { referenceId: second } });

    expect(before.summary).toEqual({ creates: 0, updates: 3, stockDeltas: 0, errors: 0 });
    expect(result).toMatchObject({ creates: 0, updates: 3, variantsUpdated: 5, movements: 0 });
    expect(movements).toBe(0);
  });

  it('applies changed stock as deltas and keeps a richly formatted description', async () => {
    const first = await uploadAndValidate(importFixture('valid.csv'));
    await applyNow(testApp, first, admin);
    const prisma = getPrisma();
    const rich = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Hand-rolled sandalwood incense sticks.' }],
        },
      ],
    };
    await prisma.product.update({ where: { sku: 'IMP-AG-001' }, data: { description: rich } });
    const changed = withLine(importFixture('valid.csv'), (line) =>
      line.includes('IMP-AG-001-20,') ? line.replace(',120,40,', ',100,40,') : line,
    );
    const second = await uploadAndValidate(changed);
    const preview = await getImport(testApp, admin, second);

    const result = await applyNow(testApp, second, admin);
    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: 'IMP-AG-001-20' },
    });
    const movement = await prisma.stockMovement.findFirst({ where: { referenceId: second } });
    const product = await prisma.product.findUniqueOrThrow({ where: { sku: 'IMP-AG-001' } });

    expect(preview.report?.stockDeltas).toEqual([
      { variantSku: 'IMP-AG-001-20', current: 120, target: 100, delta: -20 },
    ]);
    expect(result.movements).toBe(1);
    expect(variant.stock).toBe(100);
    expect(movement).toMatchObject({ delta: -20, reason: 'IMPORT', referenceId: second });
    expect(product.description).toEqual(rich);
  });

  it('rolls back everything when a category disappears between validate and apply', async () => {
    const other = await createCategory(testApp, 'Temporary');
    const sheet = withLine(importFixture('valid.csv'), (line) =>
      line.startsWith('IMP-CM-002,') ? line.replace(',agarbatti,', `,${other.slug},`) : line,
    );
    const jobId = await uploadAndValidate(sheet);
    await getPrisma().category.delete({ where: { id: other.id } });

    await expect(applyNow(testApp, jobId, admin)).rejects.toMatchObject({ code: 'VALIDATION' });
    const prisma = getPrisma();
    const dto = await getImport(testApp, admin, jobId);

    expect(await prisma.product.count({ where: { sku: { startsWith: 'IMP-' } } })).toBe(0);
    expect(await prisma.stockMovement.count({ where: { referenceId: jobId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'import.applied' } })).toBe(0);
    expect(dto.status).toBe('FAILED');
    expect(dto.error).toContain(`Unknown category "${other.slug}"`);
    expect(
      await prisma.auditLog.count({ where: { action: 'import.failed', entityId: jobId } }),
    ).toBe(1);
  });

  it('refuses apply from UPLOADED and FAILED, without step-up, for STAFF and after the file changed', async () => {
    const { job: uploaded } = await uploadImport(testApp, admin, importFixture('valid.csv'));
    const { job: failed } = await uploadImport(testApp, admin, importFixture('bad-rows.csv'));
    await validateNow(testApp, failed.id);
    const validated = await uploadAndValidate(importFixture('valid.csv'));

    const fromUploaded = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/import/${uploaded.id}/apply`,
    );
    const fromFailed = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/import/${failed.id}/apply`,
    );
    const noStepUp = await adminInject(
      testApp,
      admin.token,
      'POST',
      `/admin/import/${validated}/apply`,
    );
    const asStaff = await adminInject(
      testApp,
      staff.steppedToken,
      'POST',
      `/admin/import/${validated}/apply`,
    );
    await testApp.ports.storage.put({
      bucket: IMPORTS_BUCKET,
      key: `imports/${validated}.csv`,
      body: importFixture('bad-rows.csv'),
      contentType: 'text/csv',
    });
    const changed = await adminInject(
      testApp,
      admin.steppedToken,
      'POST',
      `/admin/import/${validated}/apply`,
    );
    await expect(applyNow(testApp, validated, admin)).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(fromUploaded.statusCode).toBe(409);
    expect(fromFailed.statusCode).toBe(409);
    expect(noStepUp.statusCode).toBe(403);
    expect(body(noStepUp).error?.code).toBe('STEP_UP_REQUIRED');
    expect(asStaff.statusCode).toBe(403);
    expect(changed.statusCode).toBe(409);
    expect(body(changed).error?.message).toContain('changed since validation');
    expect((await getImport(testApp, admin, validated)).status).toBe('FAILED');
  });

  it('enqueues import-apply with the actor through the step-up route and a worker applies it', async () => {
    const worker = await buildTestApp({ env: { JOBS_ENABLED: 'true' } });
    try {
      const jobId = await uploadAndValidate(importFixture('valid.csv'));

      const res = await adminInject(
        testApp,
        admin.steppedToken,
        'POST',
        `/admin/import/${jobId}/apply`,
      );
      const queued = await listQueuedJobs('import-apply');
      const done = await waitForJob(
        worker,
        'import-apply',
        body<{ jobId: string }>(res).data.jobId,
      );

      expect(res.statusCode).toBe(202);
      expect(queued[0]?.data).toMatchObject({
        jobId,
        actorId: admin.userId,
        userAgent: 'lightMyRequest',
      });
      expect(done.state).toBe('completed');
      expect(done.output).toMatchObject({ creates: 3, movements: 4 });
      expect((await getImport(testApp, admin, jobId)).status).toBe('APPLIED');
    } finally {
      await worker.close();
    }
  });
});
