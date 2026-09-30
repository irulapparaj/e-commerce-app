import { AppError, type CategoryInput } from '@pe/shared';
import type { Category } from '@prisma/client';

import { recordAudit } from '../audit/record';
import { deleteDerivatives } from '../media/process.job';
import { CATEGORIES_TAG, HOME_TAG, categoryTag, tagsForCategory } from '../revalidate/tags';

import type { CatalogueServiceDeps, ServiceContext } from './service-deps';
import { slugify, uniqueSlug } from './slug';
import { invalidateCategoryTree } from './tree';

export interface CategoryService {
  create(input: CategoryInput, ctx: ServiceContext): Promise<Category>;
  update(id: string, input: CategoryInput, ctx: ServiceContext): Promise<Category>;
  reorder(orderedIds: readonly string[], ctx: ServiceContext): Promise<readonly Category[]>;
  remove(id: string, ctx: ServiceContext): Promise<void>;
}

const snapshot = (row: Category) => ({
  name: row.name,
  slug: row.slug,
  parentId: row.parentId,
  sortOrder: row.sortOrder,
  imageKey: row.imageKey,
  metaTitle: row.metaTitle,
  metaDescription: row.metaDescription,
});

/** Category writes (P04 task 7): two-level tree, server-side slugs, delete refused when in use. */
export const createCategoryService = (deps: CatalogueServiceDeps): CategoryService => {
  const { prisma, revalidate, cache } = deps;

  const load = async (
    id: string,
  ): Promise<Category & { readonly parent: { slug: string } | null }> => {
    const row = await prisma.category.findUnique({
      where: { id },
      include: { parent: { select: { slug: true } } },
    });
    if (row === null) throw new AppError('NOT_FOUND', 'Category not found');
    return row;
  };

  const resolveParent = async (parentId: string | null) => {
    if (parentId === null) return null;
    const parent = await prisma.category.findUnique({
      where: { id: parentId },
      select: { id: true, slug: true, parentId: true },
    });
    if (parent === null)
      throw new AppError('VALIDATION', 'Unknown parent category', {
        details: [{ path: 'parentId', message: 'Unknown parent category' }],
      });
    if (parent.parentId !== null)
      throw new AppError('VALIDATION', 'Categories nest at most two levels', {
        details: [{ path: 'parentId', message: 'Categories nest at most two levels' }],
      });
    return parent;
  };

  const afterWrite = async (tags: readonly string[]): Promise<void> => {
    await invalidateCategoryTree(cache);
    await revalidate.notify(tags);
  };

  const create: CategoryService['create'] = async (input, ctx) => {
    const parent = await resolveParent(input.parentId);
    const base = parent === null ? slugify(input.name) : `${parent.slug}-${slugify(input.name)}`;
    const slug = await uniqueSlug(
      base,
      async (candidate) =>
        (await prisma.category.findUnique({ where: { slug: candidate }, select: { id: true } })) !==
        null,
    );
    const last = await prisma.category.aggregate({
      where: { parentId: input.parentId },
      _max: { sortOrder: true },
    });
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.category.create({
        data: { ...input, slug, sortOrder: (last._max.sortOrder ?? 0) + 1 },
      });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'category.created',
        entityType: 'category',
        entityId: row.id,
        after: snapshot(row),
      });
      return row;
    });
    await afterWrite(tagsForCategory(created.slug, parent?.slug));
    return created;
  };

  const update: CategoryService['update'] = async (id, input, ctx) => {
    const before = await load(id);
    if (input.parentId === id)
      throw new AppError('VALIDATION', 'A category cannot be its own parent');
    const parent = await resolveParent(input.parentId);
    if (parent !== null) {
      const children = await prisma.category.count({ where: { parentId: id } });
      if (children > 0)
        throw new AppError('VALIDATION', 'A category with children cannot become a child');
    }
    const after = await prisma.$transaction(async (tx) => {
      const row = await tx.category.update({ where: { id }, data: input });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'category.updated',
        entityType: 'category',
        entityId: id,
        before: snapshot(before),
        after: snapshot(row),
      });
      return row;
    });
    await afterWrite([
      ...tagsForCategory(before.slug, before.parent?.slug),
      ...(parent === null ? [] : [categoryTag(parent.slug)]),
    ]);
    return after;
  };

  const reorder: CategoryService['reorder'] = async (orderedIds, ctx) => {
    const rows = await prisma.category.findMany({
      where: { id: { in: [...orderedIds] } },
      include: { parent: { select: { slug: true } } },
    });
    if (rows.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
      throw new AppError('VALIDATION', 'orderedIds must be distinct existing categories');
    }
    const parents = new Set(rows.map((row) => row.parentId));
    if (parents.size !== 1)
      throw new AppError('VALIDATION', 'Only siblings can be reordered together');
    const updated = await prisma.$transaction(async (tx) => {
      const result = await Promise.all(
        orderedIds.map((id, index) =>
          tx.category.update({ where: { id }, data: { sortOrder: index + 1 } }),
        ),
      );
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'category.reordered',
        entityType: 'category',
        entityId: rows[0]?.parentId ?? null,
        before: { order: [...rows].sort((a, b) => a.sortOrder - b.sortOrder).map((row) => row.id) },
        after: { order: [...orderedIds] },
      });
      return result;
    });
    const parentSlug = rows[0]?.parent?.slug;
    await afterWrite([
      CATEGORIES_TAG,
      HOME_TAG,
      ...(parentSlug === undefined ? [] : [categoryTag(parentSlug)]),
    ]);
    return updated;
  };

  const remove: CategoryService['remove'] = async (id, ctx) => {
    const row = await load(id);
    const [products, children] = await Promise.all([
      prisma.product.count({ where: { categoryId: id } }),
      prisma.category.count({ where: { parentId: id } }),
    ]);
    if (products > 0)
      throw new AppError('CONFLICT', 'Move or delete its products before deleting this category');
    if (children > 0)
      throw new AppError(
        'CONFLICT',
        'Delete or move its subcategories before deleting this category',
      );
    await prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await recordAudit(tx, {
        ...ctx.actor,
        action: 'category.deleted',
        entityType: 'category',
        entityId: id,
        before: snapshot(row),
      });
    });
    if (row.imageKey !== null) await deleteDerivatives(deps.storage, deps.bucket, row.imageKey);
    await afterWrite(tagsForCategory(row.slug, row.parent?.slug));
  };

  return { create, update, reorder, remove };
};
