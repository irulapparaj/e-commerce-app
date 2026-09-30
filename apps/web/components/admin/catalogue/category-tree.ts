import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';

export type MoveDirection = -1 | 1;

/** Siblings of `node` in display order (roots when it has no parent). */
export const siblingsOf = (
  tree: readonly AdminCategoryNode[],
  node: AdminCategoryNode,
): readonly AdminCategoryNode[] =>
  node.parentId === null ? tree : (tree.find((root) => root.id === node.parentId)?.children ?? []);

/** New sibling id order after moving `id` one step, or null when it is already at that edge. */
export const movedOrder = (
  ids: readonly string[],
  id: string,
  direction: MoveDirection,
): readonly string[] | null => {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
};

/** Order after dropping `draggedId` onto `targetId` (same sibling group), or null when unrelated. */
export const droppedOrder = (
  ids: readonly string[],
  draggedId: string,
  targetId: string,
): readonly string[] | null => {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return null;
  const next = ids.filter((id) => id !== draggedId);
  next.splice(to, 0, draggedId);
  return next;
};

const sortByIds = (
  nodes: readonly AdminCategoryNode[],
  orderedIds: readonly string[],
): readonly AdminCategoryNode[] =>
  orderedIds
    .map((id, index) => {
      const node = nodes.find((candidate) => candidate.id === id);
      return node === undefined ? null : { ...node, sortOrder: index + 1 };
    })
    .filter((node): node is AdminCategoryNode => node !== null);

/** Applies a sibling order locally (immutable) so the tree updates before the server refresh. */
export const applyOrder = (
  tree: readonly AdminCategoryNode[],
  parentId: string | null,
  orderedIds: readonly string[],
): readonly AdminCategoryNode[] =>
  parentId === null
    ? sortByIds(tree, orderedIds)
    : tree.map((root) =>
        root.id === parentId ? { ...root, children: sortByIds(root.children, orderedIds) } : root,
      );

export const upsertNode = (
  tree: readonly AdminCategoryNode[],
  node: AdminCategoryNode,
): readonly AdminCategoryNode[] => {
  if (node.parentId === null) {
    const exists = tree.some((root) => root.id === node.id);
    return exists
      ? tree.map((root) => (root.id === node.id ? { ...node, children: root.children } : root))
      : [...tree, node];
  }
  return tree.map((root) => {
    if (root.id !== node.parentId) return root;
    const exists = root.children.some((child) => child.id === node.id);
    return {
      ...root,
      children: exists
        ? root.children.map((child) => (child.id === node.id ? node : child))
        : [...root.children, node],
    };
  });
};

export const removeNode = (
  tree: readonly AdminCategoryNode[],
  id: string,
): readonly AdminCategoryNode[] =>
  tree
    .filter((root) => root.id !== id)
    .map((root) => ({ ...root, children: root.children.filter((child) => child.id !== id) }));
