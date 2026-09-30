import {
  AppError,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportRow,
  type RichTextDocument,
  richTextDocumentSchema,
  richTextToPlainText,
} from '@pe/shared';
import type { Prisma } from '@prisma/client';

import type { PrismaTx } from '../../db/prisma';
import type { ImportApplyPayload } from '../../jobs/queue';
import { type AuditActor, recordAudit } from '../audit/record';
import { toDecimal } from '../catalogue/service-deps';
import { slugify, uniqueSlug } from '../catalogue/slug';
import { applyMovement } from '../inventory/apply-movement';
import { HOME_TAG, SEARCH_TAG, tagsForProduct } from '../revalidate/tags';

import { type ImportDeps, readObject, sha256 } from './deps';
import { parseImportFile } from './parse';
import { groupRows, type ProductGroup } from './validate';
import { loadImportJob, markImportFailed } from './validate.job';

export interface ImportApplyResult {
  readonly jobId: string;
  readonly creates: number;
  readonly updates: number;
  readonly variantsCreated: number;
  readonly variantsUpdated: number;
  readonly movements: number;
  /** Products where the CSV requested isActive=true but conditions (≥1 image) were not met. */
  readonly activationDeferred: number;
}

interface GroupResult {
  readonly created: boolean;
  readonly variantsCreated: number;
  readonly variantsUpdated: number;
  readonly movements: number;
  readonly activationDeferred: number;
  readonly tags: readonly string[];
}

interface ApplyMeta {
  readonly jobId: string;
  readonly actorId: string;
}

/**
 * Each batch of ~100 product groups runs in its own short transaction, keeping FOR UPDATE locks
 * off the variant rows for at most a few seconds rather than holding them for the whole sheet.
 */
const BATCH_SIZE = 100;
const BATCH_TX_TIMEOUT_MS = 30_000;
const APPLY_TX_MAX_WAIT_MS = 10_000;

/**
 * Include image count so that activation-gate checks can be made without an extra query.
 * H-23: import must respect the "≥1 variant + ≥1 image" rule that the catalogue service enforces.
 */
const EXISTING_PRODUCT_SELECT = {
  id: true,
  slug: true,
  description: true,
  isFeatured: true,
  variants: { select: { id: true, isDefault: true } },
  images: { select: { id: true } },
} satisfies Prisma.ProductSelect;

type ExistingProduct = Prisma.ProductGetPayload<{ select: typeof EXISTING_PRODUCT_SELECT }>;

/** A plain-text cell becomes one paragraph; a multi-line cell becomes one paragraph per line. */
export const textToRichText = (text: string): RichTextDocument => ({
  type: 'doc',
  content: text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: line }],
    })),
});

/** Keeps a richly formatted description when the sheet still carries its plain-text projection. */
export const descriptionUpdate = (
  existing: unknown,
  text: string,
): RichTextDocument | undefined => {
  const parsed = richTextDocumentSchema.safeParse(existing);
  if (parsed.success && richTextToPlainText(parsed.data) === text.trim()) return undefined;
  return textToRichText(text);
};

/**
 * Common product fields that do NOT include isActive — activation is determined separately
 * after checking the "≥1 image" condition (H-23: isActive must never bypass the service gate).
 */
const productFields = (row: ImportRow, categoryId: string) => ({
  name: row.name,
  categoryId,
  specifications: row.specifications,
  howToUse: row.how_to_use,
  tags: [...row.tags],
  hsnCode: row.hsn_code,
  gstRate: toDecimal(row.gst_rate),
  isFeatured: row.is_featured,
  metaTitle: row.meta_title,
  metaDescription: row.meta_description,
});

const variantFields = (row: ImportRow) => ({
  label: row.variant_label,
  price: row.price_inr,
  compareAtPrice: row.compare_at_price_inr,
  weightGrams: row.weight_grams,
  lowStockThreshold: row.low_stock_threshold,
});

/**
 * New products always start inactive — they have no images at import time so the
 * "≥1 variant + ≥1 image" activation gate cannot be satisfied.
 */
const createProduct = async (tx: PrismaTx, group: ProductGroup, categoryId: string) => {
  const slug = await uniqueSlug(
    slugify(group.product.name),
    async (candidate) =>
      (await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } })) !== null,
  );
  return tx.product.create({
    data: {
      ...productFields(group.product, categoryId),
      sku: group.sku,
      slug,
      isActive: false,
      description: textToRichText(
        group.product.description_text,
      ) as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, slug: true },
  });
};

/**
 * For existing products, honour the CSV's is_active flag only when the product already has at
 * least one image — otherwise defer activation and set isActive: false (H-23).
 */
const updateProduct = async (
  tx: PrismaTx,
  existing: ExistingProduct,
  group: ProductGroup,
  categoryId: string,
) => {
  const description = descriptionUpdate(existing.description, group.product.description_text);
  const hasImages = existing.images.length > 0;
  const isActive = group.product.is_active && hasImages;
  return tx.product.update({
    where: { id: existing.id },
    data: {
      ...productFields(group.product, categoryId),
      isActive,
      ...(description === undefined
        ? {}
        : { description: description as unknown as Prisma.InputJsonValue }),
    },
    select: { id: true, slug: true },
  });
};

const upsertVariant = async (
  tx: PrismaTx,
  productId: string,
  row: ImportRow,
  makeDefault: boolean,
): Promise<{ id: string; isDefault: boolean; created: boolean }> => {
  const existing = await tx.productVariant.findUnique({
    where: { sku: row.variant_sku },
    select: { id: true, productId: true, isDefault: true },
  });
  if (existing !== null && existing.productId !== productId)
    throw new AppError('CONFLICT', `Variant ${row.variant_sku} belongs to another product`);
  if (existing !== null) {
    await tx.productVariant.update({ where: { id: existing.id }, data: variantFields(row) });
    return { id: existing.id, isDefault: existing.isDefault, created: false };
  }
  const created = await tx.productVariant.create({
    data: {
      ...variantFields(row),
      sku: row.variant_sku,
      productId,
      isDefault: makeDefault,
      stock: 0,
    },
    select: { id: true, isDefault: true },
  });
  return { ...created, created: true };
};

/** Locks the row so the delta is computed against the stock no concurrent sale can change. */
const lockedStock = async (tx: PrismaTx, variantId: string): Promise<number> => {
  const rows = await tx.$queryRaw<{ stock: number }[]>`
    SELECT "stock" FROM "product_variant" WHERE "id" = ${variantId}::uuid FOR UPDATE`;
  return rows[0]?.stock ?? 0;
};

const applyGroup = async (
  tx: PrismaTx,
  group: ProductGroup,
  meta: ApplyMeta,
): Promise<GroupResult> => {
  const category = await tx.category.findUnique({
    where: { slug: group.product.category_slug },
    select: { id: true, slug: true, parent: { select: { slug: true } } },
  });
  if (category === null) {
    throw new AppError(
      'VALIDATION',
      `Unknown category "${group.product.category_slug}" for sku ${group.sku} (row ${group.firstLine})`,
    );
  }
  const existing = await tx.product.findUnique({
    where: { sku: group.sku },
    select: EXISTING_PRODUCT_SELECT,
  });
  const product =
    existing === null
      ? await createProduct(tx, group, category.id)
      : await updateProduct(tx, existing, group, category.id);

  // Track whether activation was deferred (CSV requested active but conditions not met).
  const hasImages = existing !== null ? existing.images.length > 0 : false;
  const activationDeferred = group.product.is_active && !hasImages ? 1 : 0;

  let hasDefault = existing?.variants.some((variant) => variant.isDefault) ?? false;
  let counts = { variantsCreated: 0, variantsUpdated: 0, movements: 0 };
  for (const { row } of group.variants) {
    const variant = await upsertVariant(tx, product.id, row, !hasDefault);
    hasDefault = hasDefault || variant.isDefault;
    const delta = row.stock - (await lockedStock(tx, variant.id));
    if (delta !== 0) {
      await applyMovement(
        {
          variantId: variant.id,
          delta,
          reason: 'IMPORT',
          referenceId: meta.jobId,
          actorId: meta.actorId,
          note: `Import ${meta.jobId}`,
        },
        tx,
      );
    }
    counts = {
      variantsCreated: counts.variantsCreated + (variant.created ? 1 : 0),
      variantsUpdated: counts.variantsUpdated + (variant.created ? 0 : 1),
      movements: counts.movements + (delta === 0 ? 0 : 1),
    };
  }
  return {
    created: existing === null,
    ...counts,
    activationDeferred,
    tags: tagsForProduct({
      slug: product.slug,
      categorySlug: category.slug,
      parentCategorySlug: category.parent?.slug,
      isFeatured: group.product.is_featured || (existing?.isFeatured ?? false),
    }),
  };
};

const sum = (results: readonly GroupResult[], key: keyof Omit<GroupResult, 'tags' | 'created'>) =>
  results.reduce((total, result) => total + result[key], 0);

/**
 * `import-apply` job: products are upserted by `sku`, variants by `variant_sku`, stock lands in the
 * ledger as IMPORT deltas with the job as reference, one audit row carries the counts.
 *
 * H-06: rows are processed in batches of ~100 so no single transaction holds FOR UPDATE locks on
 * the entire sheet. Each batch commits independently; a batch failure marks the job FAILED with the
 * failing row range. The final audit + status update is its own short transaction.
 *
 * H-23: new products always start with isActive=false regardless of the CSV value; existing
 * products are only activated when they already have at least one image.
 */
export const runImportApply = async (
  deps: ImportDeps,
  payload: ImportApplyPayload,
): Promise<ImportApplyResult> => {
  const job = await loadImportJob(deps, payload.jobId);
  const actor: AuditActor = {
    actorId: payload.actorId,
    ip: payload.ip,
    userAgent: payload.userAgent,
  };
  if (job.status !== 'VALIDATED' || job.errorRows > 0)
    throw new AppError('CONFLICT', 'Only a clean, validated import can be applied');
  const bytes = await readObject(deps, job.fileKey, IMPORT_MAX_BYTES);
  if (sha256(bytes) !== job.fileHash) {
    await markImportFailed(deps, job.id, 'File changed since validation; validate it again', actor);
    throw new AppError('CONFLICT', 'File changed since validation; validate it again');
  }
  const parsed = await parseImportFile(bytes, job.contentType, { maxRows: IMPORT_MAX_ROWS });
  const { groups, errors } = groupRows(parsed.rows);
  if (errors.length > 0) throw new AppError('CONFLICT', 'The file no longer validates');
  const meta: ApplyMeta = { jobId: job.id, actorId: payload.actorId };

  const allResults: GroupResult[] = [];
  let batchStart = 0;

  // Separate the data-mutating try/catch from the post-apply notification so that a
  // transient revalidate failure cannot flip an already-APPLIED import to FAILED (BL-10).
  let summary: ImportApplyResult;
  try {
    // H-06: process in batches to avoid a single multi-minute transaction locking all variants.
    for (let i = 0; i < groups.length; i += BATCH_SIZE) {
      batchStart = i;
      const batch = groups.slice(i, i + BATCH_SIZE);
      const batchResults = await deps.prisma.$transaction(
        async (tx) => {
          const results: GroupResult[] = [];
          for (const group of batch) {
            results.push(await applyGroup(tx, group, meta));
          }
          return results;
        },
        { timeout: BATCH_TX_TIMEOUT_MS, maxWait: APPLY_TX_MAX_WAIT_MS },
      );
      allResults.push(...batchResults);
    }

    // Final short transaction: mark APPLIED and record the audit row.
    summary = {
      jobId: job.id,
      creates: allResults.filter((item) => item.created).length,
      updates: allResults.filter((item) => !item.created).length,
      variantsCreated: sum(allResults, 'variantsCreated'),
      variantsUpdated: sum(allResults, 'variantsUpdated'),
      movements: sum(allResults, 'movements'),
      activationDeferred: sum(allResults, 'activationDeferred'),
    };

    await deps.prisma.$transaction(
      async (tx) => {
        await tx.importJob.update({
          where: { id: job.id },
          data: { status: 'APPLIED', appliedAt: deps.now(), error: null },
        });
        await recordAudit(tx, {
          ...actor,
          action: 'import.applied',
          entityType: 'import_job',
          entityId: job.id,
          after: { ...summary, totalRows: job.totalRows },
        });
      },
      { timeout: BATCH_TX_TIMEOUT_MS, maxWait: APPLY_TX_MAX_WAIT_MS },
    );
  } catch (error) {
    const rangeNote =
      allResults.length < groups.length
        ? ` (failed near row group ${batchStart + 1}–${Math.min(batchStart + BATCH_SIZE, groups.length)})`
        : '';
    const message = `${error instanceof Error ? error.message : 'Import failed'}${rangeNote}`;
    await markImportFailed(deps, job.id, message, actor);
    deps.log.warn({ jobId: job.id, err: error }, 'import apply failed');
    throw error;
  }

  // Post-apply: revalidate CDN tags and log. These are best-effort — failure must never flip
  // an already-APPLIED import back to FAILED.
  const tags = allResults.flatMap((item) => item.tags);
  try {
    await deps.revalidate.notify([...tags, HOME_TAG, SEARCH_TAG]);
  } catch (notifyError) {
    deps.log.warn({ jobId: job.id, err: notifyError }, 'import applied but revalidate notify failed');
  }
  deps.log.info({ ...summary }, 'import applied');
  return summary;
};
