'use client';

import type { DragEvent } from 'react';

import type { AdminCategoryNode } from '@/lib/admin/catalogue-types';
import { formatCount } from '@/lib/admin/format';

import type { AdminRole } from '../Nav.config';

import { ImageUploader } from './ImageUploader';

export interface NodeHandlers {
  readonly onEdit: (node: AdminCategoryNode) => void;
  readonly onAddChild: (node: AdminCategoryNode) => void;
  readonly onMove: (node: AdminCategoryNode, direction: -1 | 1) => void;
  readonly onDelete: (node: AdminCategoryNode) => void;
  readonly onDrop: (draggedId: string, target: AdminCategoryNode) => void;
  readonly onDragStart: (node: AdminCategoryNode) => void;
  readonly onDragEnd: () => void;
  readonly onImageUploaded: () => void | Promise<void>;
}

interface CategoryNodeRowProps {
  readonly node: AdminCategoryNode;
  readonly role: AdminRole;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly dragging: string | null;
  readonly handlers: NodeHandlers;
}

const canReceive = (
  dragging: string | null,
  node: AdminCategoryNode,
  siblingIds: readonly string[],
) => dragging !== null && dragging !== node.id && siblingIds.includes(dragging);

/** One row of the category tree: thumbnail, name, counts and (for ADMIN) the row actions. */
export function CategoryNodeRow({
  node,
  role,
  isFirst,
  isLast,
  dragging,
  handlers,
}: CategoryNodeRowProps) {
  const isAdmin = role === 'ADMIN';
  const isRoot = node.parentId === null;
  const siblingIds = dragging === null ? [] : [dragging, node.id];

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canReceive(dragging, node, siblingIds)) return;
    event.preventDefault();
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (dragging !== null) handlers.onDrop(dragging, node);
  };

  return (
    <div
      className="admin-tree-row"
      draggable={isAdmin}
      data-dragging={dragging === node.id ? 'true' : undefined}
      onDragStart={() => handlers.onDragStart(node)}
      onDragEnd={handlers.onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid={`category-row-${node.slug}`}
    >
      {node.imageUrl === null ? (
        <span className="admin-tree-thumb admin-tree-thumb-empty" aria-hidden="true" />
      ) : (
        <img className="admin-tree-thumb" src={node.imageUrl} alt="" width={40} height={40} />
      )}
      <span className="admin-tree-name">
        {node.name}
        <span className="admin-tree-meta">
          <code className="admin-mono">{node.slug}</code> · {formatCount(node.productCount)}{' '}
          products
        </span>
      </span>
      {isAdmin && (
        <span className="admin-row-actions">
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => handlers.onMove(node, -1)}
            disabled={isFirst}
            aria-label={`Move ${node.name} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => handlers.onMove(node, 1)}
            disabled={isLast}
            aria-label={`Move ${node.name} down`}
          >
            ↓
          </button>
          {isRoot && (
            <button
              type="button"
              className="admin-btn admin-btn-small"
              onClick={() => handlers.onAddChild(node)}
              data-testid={`category-add-child-${node.slug}`}
            >
              Add subcategory
            </button>
          )}
          <button
            type="button"
            className="admin-btn admin-btn-small"
            onClick={() => handlers.onEdit(node)}
            data-testid={`category-edit-${node.slug}`}
          >
            Edit
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-danger"
            onClick={() => handlers.onDelete(node)}
            data-testid={`category-delete-${node.slug}`}
          >
            Delete
          </button>
          <details className="admin-tree-meta">
            <summary>Image</summary>
            <ImageUploader
              presignPath={`/admin/categories/${node.id}/image/presign`}
              confirmPath={`/admin/categories/${node.id}/image/confirm`}
              currentCount={0}
              max={1}
              multiple={false}
              withAlt={false}
              label={node.imageKey === null ? 'Upload image' : 'Replace image'}
              onUploaded={handlers.onImageUploaded}
            />
          </details>
        </span>
      )}
    </div>
  );
}
