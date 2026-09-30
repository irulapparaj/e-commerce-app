import type { PrismaDb } from '../../db/prisma';
import type { JsonCache } from '../../lib/cache';
import { CATEGORY_IMAGE_WIDTH, type ImageUrlBuilder } from '../media/url';

import type { CategoryNode } from './dto';

export const CATEGORY_TREE_CACHE_KEY = 'cat:tree';
export const CATEGORY_TREE_TTL_SECONDS = 300;

interface CategoryRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly imageKey: string | null;
}

export interface CategoryTreeDeps {
  readonly prisma: Pick<PrismaDb, 'category'>;
  readonly cache: JsonCache;
  readonly urls: ImageUrlBuilder;
}

const toNode = async (
  row: CategoryRow,
  children: readonly CategoryNode[],
  urls: ImageUrlBuilder,
): Promise<CategoryNode> => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  imageUrl:
    row.imageKey === null ? null : await urls.url(row.imageKey, CATEGORY_IMAGE_WIDTH, 'webp'),
  children,
});

/** Two-level tree ordered by sortOrder then name; cached in Valkey for five minutes. */
export const buildCategoryTree = async (
  deps: CategoryTreeDeps,
): Promise<readonly CategoryNode[]> => {
  const rows = await deps.prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, parentId: true, imageKey: true },
  });
  const roots = rows.filter((row) => row.parentId === null);
  return Promise.all(
    roots.map(async (root) => {
      const children = await Promise.all(
        rows.filter((row) => row.parentId === root.id).map((row) => toNode(row, [], deps.urls)),
      );
      return toNode(root, children, deps.urls);
    }),
  );
};

export const getCategoryTree = async (deps: CategoryTreeDeps): Promise<readonly CategoryNode[]> => {
  const cached = await deps.cache.get<readonly CategoryNode[]>(CATEGORY_TREE_CACHE_KEY);
  if (cached !== null) return cached;
  const tree = await buildCategoryTree(deps);
  await deps.cache.set(CATEGORY_TREE_CACHE_KEY, tree, CATEGORY_TREE_TTL_SECONDS);
  return tree;
};

export const invalidateCategoryTree = (cache: JsonCache): Promise<void> =>
  cache.del(CATEGORY_TREE_CACHE_KEY);
