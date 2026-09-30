'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';

import { ConfirmDialog } from '../ConfirmDialog';
import { EmptyState } from '../EmptyState';
import type { AdminRole } from '../Nav.config';
import { PageHeader } from '../PageHeader';
import { useToast } from '../Toast';

import {
  applyOrder,
  droppedOrder,
  movedOrder,
  removeNode,
  siblingsOf,
  upsertNode,
} from './category-tree';
import { CategoryDialog, type CategoryDialogTarget } from './CategoryDialog';
import { CategoryNodeRow, type NodeHandlers } from './CategoryNodeRow';

interface CategoryTreeProps {
  readonly tree: readonly AdminCategoryNode[];
  readonly role: AdminRole;
}

const messageOf = (error: unknown, fallback: string): string =>
  isAdminApiError(error) ? error.message : fallback;

/** Two-level category editor (P06 task 9). Reordering is per sibling group; deletes surface the API guard. */
export function CategoryTree({ tree: initial, role }: CategoryTreeProps) {
  const router = useRouter();
  const { notify } = useToast();
  const [tree, setTree] = useState(initial);
  const [dialog, setDialog] = useState<CategoryDialogTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminCategoryNode | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reorder = async (node: AdminCategoryNode, orderedIds: readonly string[] | null) => {
    if (orderedIds === null) return;
    const previous = tree;
    setTree(applyOrder(tree, node.parentId, orderedIds));
    try {
      await adminApi.patch('/admin/categories/reorder', { orderedIds });
      router.refresh();
    } catch (error) {
      setTree(previous);
      notify(messageOf(error, 'Could not reorder categories.'), 'critical');
    }
  };

  const remove = async () => {
    if (pendingDelete === null) return;
    setBusy(true);
    try {
      await adminApi.del(`/admin/categories/${pendingDelete.id}`);
      setTree(removeNode(tree, pendingDelete.id));
      notify(`Deleted ${pendingDelete.name}`, 'success');
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      notify(messageOf(error, 'Could not delete the category.'), 'critical');
    } finally {
      setBusy(false);
    }
  };

  const handlers: NodeHandlers = {
    onEdit: (node) => setDialog({ mode: 'edit', node, parentId: node.parentId }),
    onAddChild: (node) => setDialog({ mode: 'create', node: null, parentId: node.id }),
    onMove: (node, direction) => {
      const ids = siblingsOf(tree, node).map((sibling) => sibling.id);
      void reorder(node, movedOrder(ids, node.id, direction));
    },
    onDelete: (node) => setPendingDelete(node),
    onDragStart: (node) => setDragging(node.id),
    onDragEnd: () => setDragging(null),
    onDrop: (draggedId, target) => {
      setDragging(null);
      const ids = siblingsOf(tree, target).map((sibling) => sibling.id);
      void reorder(target, droppedOrder(ids, draggedId, target.id));
    },
    onImageUploaded: () => router.refresh(),
  };

  const renderRow = (node: AdminCategoryNode, siblings: readonly AdminCategoryNode[]) => (
    <CategoryNodeRow
      node={node}
      role={role}
      isFirst={siblings[0]?.id === node.id}
      isLast={siblings[siblings.length - 1]?.id === node.id}
      dragging={dragging}
      handlers={handlers}
    />
  );

  return (
    <>
      <PageHeader
        title="Categories"
        description="Two levels: top-level categories and their subcategories. Drag or use the arrows to reorder."
        actions={
          role === 'ADMIN' ? (
            <button
              type="button"
              className="admin-btn admin-btn-primary"
              onClick={() => setDialog({ mode: 'create', node: null, parentId: null })}
              data-testid="category-add-root"
            >
              New category
            </button>
          ) : undefined
        }
      />
      {tree.length === 0 ? (
        <EmptyState title="No categories yet" description="Create a top-level category to start." />
      ) : (
        <ul className="admin-tree" data-testid="category-tree">
          {tree.map((root) => (
            <li key={root.id}>
              {renderRow(root, tree)}
              {root.children.length > 0 && (
                <ul className="admin-tree-children">
                  {root.children.map((child) => (
                    <li key={child.id}>{renderRow(child, root.children)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <CategoryDialog
        target={dialog}
        roots={tree}
        onClose={() => setDialog(null)}
        onSaved={(node) => {
          setTree(upsertNode(tree, node));
          setDialog(null);
          notify('Saved', 'success');
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete?.name ?? 'category'}?`}
        body="Only empty categories can be deleted; move its products and subcategories first."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setPendingDelete(null)}
        testId="category-delete-confirm"
      />
    </>
  );
}
