import Image from 'next/image';

import { cx } from '@/components/ui/cx';
import { Icon } from '@/components/ui/Icon';
import { Link as IntlLink } from '@/i18n/navigation';
import type { CategoryNode } from '@/lib/api/types';

interface CategoryTileProps {
  readonly category: Pick<CategoryNode, 'slug' | 'name' | 'imageUrl'>;
}

const TILE_SIZES = '(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 180px';

/**
 * One category, portrait (`--aspect-category`). With an image: the still under a hero-tinted scrim
 * and the name in hero type. Without one: a typographic tile (oversized initial in hairline ink)
 * instead of a coloured block, so an unfinished catalogue still looks deliberate.
 */
export function CategoryTile({ category }: CategoryTileProps) {
  const hasImage = category.imageUrl !== null && category.imageUrl !== '';
  const initial = category.name.trim().charAt(0).toUpperCase();

  return (
    <IntlLink
      href={`/collections/${category.slug}`}
      className="group relative flex aspect-category w-full overflow-hidden rounded-image border border-hairline bg-surface no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      data-testid="category-tile"
    >
      {hasImage ? (
        <>
          <Image
            src={category.imageUrl}
            alt=""
            fill
            sizes={TILE_SIZES}
            className="object-cover transition-transform duration-normal ease-out motion-safe:group-hover:scale-[1.04]"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-hero/80 via-hero/20 to-transparent"
          />
        </>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex select-none items-center justify-center font-display text-[6rem] leading-none text-hairline"
          data-testid="category-tile-fallback"
        >
          {initial}
        </span>
      )}

      <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 lg:p-4">
        <span
          className={cx(
            'font-display text-h3 leading-tight',
            hasImage ? 'text-hero-text' : 'text-text',
          )}
        >
          {category.name}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            'mb-0.5 translate-x-1 opacity-0 transition-[opacity,transform] duration-fast ease-out group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100',
            hasImage ? 'text-hero-muted' : 'text-muted',
          )}
        >
          <Icon name="arrow" size={16} />
        </span>
      </span>
    </IntlLink>
  );
}
