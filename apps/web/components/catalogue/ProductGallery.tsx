'use client';

import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';

import { cx } from '@/components/ui/cx';
import { Dialog } from '@/components/ui/Dialog';
import type { ImageUrls } from '@/lib/api/types';

interface ProductGalleryProps {
  readonly images: readonly ImageUrls[];
  readonly name: string;
}

export function ProductGallery({ images, name }: ProductGalleryProps) {
  const t = useTranslations('catalogue');
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-image bg-surface text-muted text-caption">
        {name}
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, images.length - 1);
  const active = images[safeIndex];

  const prev = () => setActiveIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setActiveIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  const onMainKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomOpen(true); }
  };

  if (active === undefined) return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-label={t('zoomImage')}
        onClick={() => setZoomOpen(true)}
        onKeyDown={onMainKeyDown}
        className="relative aspect-square w-full overflow-hidden rounded-image bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-zoom-in"
      >
        {/* H-30: LCP image — serve AVIF/WebP srcsets so the correct derivative is loaded. */}
        <picture className="absolute inset-0 h-full w-full">
          <source
            type="image/avif"
            srcSet={active.srcset.avif}
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <source
            type="image/webp"
            srcSet={active.srcset.webp}
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={active.src}
            alt={active.alt || name}
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
        </picture>
      </button>

      {images.length > 1 && (
        <div
          role="list"
          aria-label={t('gallery')}
          className="grid grid-cols-5 gap-2"
        >
          {images.map((img, idx) => (
            <button
              key={idx}
              type="button"
              role="listitem"
              aria-label={t('thumbnail', { n: idx + 1 })}
              aria-current={idx === safeIndex}
              onClick={() => setActiveIndex(idx)}
              className={cx(
                'relative aspect-square overflow-hidden rounded-image bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-opacity duration-fast ease-out',
                idx === safeIndex ? 'ring-2 ring-accent' : 'opacity-60 hover:opacity-100',
              )}
            >
              <picture className="absolute inset-0 h-full w-full">
                <source type="image/avif" srcSet={img.srcset.avif} sizes="80px" />
                <source type="image/webp" srcSet={img.srcset.webp} sizes="80px" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.alt || `${name} ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </picture>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={zoomOpen}
        onClose={() => setZoomOpen(false)}
        title={name}
        size="lg"
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-image">
          <picture className="absolute inset-0 h-full w-full">
            <source type="image/avif" srcSet={active.srcset.avif} sizes="100vw" />
            <source type="image/webp" srcSet={active.srcset.webp} sizes="100vw" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={active.src}
              alt={active.alt || name}
              className="h-full w-full object-contain"
            />
          </picture>
        </div>
      </Dialog>
    </div>
  );
}
