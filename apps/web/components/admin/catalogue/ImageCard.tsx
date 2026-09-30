'use client';

import { IMAGE_ALT_MAX } from '@pe/shared';
import { type DragEvent, useState } from 'react';

import type { AdminImage } from '@/lib/admin/catalogue-types';

interface ImageCardProps {
  readonly image: AdminImage;
  readonly position: number;
  readonly count: number;
  readonly busy: boolean;
  readonly dragging: boolean;
  readonly dropTarget: boolean;
  readonly onSaveAlt: (alt: string) => void;
  readonly onMove: (offset: -1 | 1) => void;
  readonly onDelete: () => void;
  readonly onDragStart: () => void;
  readonly onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDragEnd: () => void;
  readonly onDrop: (event: DragEvent<HTMLLIElement>) => void;
}

const THUMB_SIZE = 320;

/** One thumbnail: alt text (saved on blur/Enter), move buttons as the keyboard path, delete. */
export function ImageCard({
  image,
  position,
  count,
  busy,
  dragging,
  dropTarget,
  onSaveAlt,
  onMove,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: ImageCardProps) {
  const [alt, setAlt] = useState(image.alt);
  const [synced, setSynced] = useState(image.alt);
  if (synced !== image.alt) {
    setSynced(image.alt);
    setAlt(image.alt);
  }
  const ordinal = position + 1;

  return (
    <li
      className="admin-image-card"
      draggable={!busy}
      data-dragging={dragging ? 'true' : undefined}
      data-drop-target={dropTarget ? 'true' : undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      data-testid="image-card"
    >
      <img
        src={image.thumbUrl}
        alt={image.alt === '' ? `Image ${ordinal}` : image.alt}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        loading="lazy"
        className="admin-image-thumb"
      />
      <label className="admin-visually-hidden" htmlFor={`alt-${image.id}`}>
        Alt text for image {ordinal}
      </label>
      <input
        id={`alt-${image.id}`}
        type="text"
        className="admin-input admin-input-small"
        placeholder="Alt text"
        maxLength={IMAGE_ALT_MAX}
        value={alt}
        onChange={(event) => setAlt(event.target.value)}
        onBlur={() => onSaveAlt(alt.trim())}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSaveAlt(alt.trim());
          }
        }}
      />
      <div className="admin-image-actions">
        <span className="admin-icon-group">
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-icon"
            aria-label={`Move image ${ordinal} left`}
            disabled={busy || position === 0}
            onClick={() => onMove(-1)}
          >
            ←
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-small admin-btn-icon"
            aria-label={`Move image ${ordinal} right`}
            disabled={busy || position === count - 1}
            onClick={() => onMove(1)}
          >
            →
          </button>
        </span>
        <button
          type="button"
          className="admin-btn admin-btn-small admin-btn-icon admin-btn-danger"
          aria-label={`Delete image ${ordinal}`}
          disabled={busy}
          onClick={onDelete}
        >
          ×
        </button>
      </div>
    </li>
  );
}
