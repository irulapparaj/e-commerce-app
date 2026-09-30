'use client';

import { type DragEvent, useState } from 'react';

import { adminApi, isAdminApiError } from '@/lib/admin/api';
import type { AdminImage } from '@/lib/admin/catalogue-types';

import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../Toast';

import { ImageCard } from './ImageCard';

interface ImageGridProps {
  readonly productId: string;
  readonly images: readonly AdminImage[];
  readonly onChanged: (images: readonly AdminImage[]) => void;
}

/** Moves the item with `fromId` to the position of `toId`, shifting the rest. */
export const moveImage = (
  images: readonly AdminImage[],
  fromId: string,
  toId: string,
): readonly AdminImage[] => {
  const from = images.findIndex((image) => image.id === fromId);
  const to = images.findIndex((image) => image.id === toId);
  if (from === -1 || to === -1 || from === to) return images;
  const without = images.filter((image) => image.id !== fromId);
  const moved = images[from];
  if (moved === undefined) return images;
  return [...without.slice(0, to), moved, ...without.slice(to)];
};

const describe = (error: unknown, fallback: string): string =>
  isAdminApiError(error) ? error.message : fallback;

/** Thumbnails with alt text, drag or button reorder and delete; every change is one API call. */
export function ImageGrid({ productId, images, onChanged }: ImageGridProps) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<AdminImage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const base = `/admin/products/${productId}/images`;

  const reorder = async (next: readonly AdminImage[]) => {
    if (next === images) return;
    setBusy(true);
    try {
      const { data } = await adminApi.patch<readonly AdminImage[]>(`${base}/order`, {
        orderedIds: next.map((image) => image.id),
      });
      onChanged(data);
    } catch (error) {
      notify(describe(error, 'Could not reorder the images'), 'critical');
    } finally {
      setBusy(false);
    }
  };

  const saveAlt = async (image: AdminImage, alt: string) => {
    if (alt === image.alt) return;
    try {
      const { data } = await adminApi.patch<AdminImage>(`${base}/${image.id}`, { alt });
      onChanged(images.map((entry) => (entry.id === image.id ? data : entry)));
      notify('Alt text saved', 'success');
    } catch (error) {
      notify(describe(error, 'Could not save the alt text'), 'critical');
    }
  };

  const remove = async (image: AdminImage) => {
    setBusy(true);
    try {
      await adminApi.del(`${base}/${image.id}`);
      onChanged(images.filter((entry) => entry.id !== image.id));
      notify('Image deleted', 'success');
    } catch (error) {
      notify(describe(error, 'Could not delete the image'), 'critical');
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  const shift = (image: AdminImage, offset: -1 | 1) => {
    const index = images.findIndex((entry) => entry.id === image.id);
    const target = images[index + offset];
    if (target !== undefined) void reorder(moveImage(images, image.id, target.id));
  };

  const onDrop = (event: DragEvent<HTMLLIElement>, target: AdminImage) => {
    event.preventDefault();
    const source = dragging;
    setDragging(null);
    setDropTarget(null);
    if (source !== null) void reorder(moveImage(images, source, target.id));
  };

  return (
    <>
      <ul className="admin-image-grid" aria-label="Product images" data-testid="image-grid">
        {images.map((image, index) => (
          <ImageCard
            key={image.id}
            image={image}
            position={index}
            count={images.length}
            busy={busy}
            dragging={dragging === image.id}
            dropTarget={dropTarget === image.id}
            onSaveAlt={(alt) => void saveAlt(image, alt)}
            onMove={(offset) => shift(image, offset)}
            onDelete={() => setDeleting(image)}
            onDragStart={() => setDragging(image.id)}
            onDragOver={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== image.id) setDropTarget(image.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropTarget(null);
            }}
            onDrop={(event) => onDrop(event, image)}
          />
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete this image?"
        body="The original and its derivatives are removed from storage. This cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={() => (deleting === null ? undefined : void remove(deleting))}
        onCancel={() => setDeleting(null)}
        testId="image-delete-confirm"
      />
    </>
  );
}
